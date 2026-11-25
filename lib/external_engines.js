// External engine extension point (phase 1 of docs/engine-extension-plan.md).
//
// A third-party engine is nothing more than a package sitting in the profile's
// node_modules with a marker field:
//
//   { "name": "dsh-free-search-engine-webz",
//     "dsh": { "freeSearch": "./lib/webz.js" } }
//
// The entry module exports `freeSearchEngine` with apiVersion 1. This file finds
// those packages, validates them, and hands back a table the plugin can register
// into its runner map. It never touches the 43 built-in engines.
//
// Everything here is side-effect free and takes its inputs as arguments, so the
// whole thing can be asserted offline against fixture packages.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Contract version this build understands. A package declaring another one is skipped. */
export const EXTERNAL_API_VERSION = 1;

/** Where the marker lives inside a package.json. */
export const MARKER_KEY = "dsh";
export const MARKER_FIELD = "freeSearch";

/** Naming convention for externally published engines (informational, not enforced). */
export const EXTERNAL_NAME_PREFIX = "dsh-free-search-engine-";

/** Package names we must never treat as engines (ourselves). */
const SELF_PACKAGE = "dsh-free-search";

/**
 * Engines the settings page may install with a button.
 *
 * Hard-coded on purpose: the install handler turns a package name into a
 * `pnpm add` shell argument, so anything not on this list would be a
 * remote-code-execution button. Third-party engines still install fine with
 * `pnpm add` from the command line and show up under "installed" afterwards.
 */
export const INSTALLABLE_ENGINES = [
  {
    packageName: "dsh-free-search-engine-webz",
    id: "webz",
    label: { zh: "Webz.io 新闻", en: "Webz.io News" },
    description: {
      zh: "全球新闻检索，按相关度返回标题、摘要与发布时间。",
      en: "Global news search with relevance-ranked titles, summaries and publish dates.",
    },
    requiresKey: ["WEBZ_API_TOKEN"],
    link: "https://app.webz.io/login/signup",
  },
];

/** The allowlist entry for a package name, or undefined when it may not be installed. */
export function installableEngine(packageName) {
  return INSTALLABLE_ENGINES.find((entry) => entry.packageName === packageName);
}

/**
 * Top-level package directories inside a node_modules folder, with scopes expanded.
 *
 * Deliberately shallow: no nested `node_modules` (host internals and our own
 * transitive deps live there and would be misread as engines) and no `.pnpm`
 * (internal layout that may change between package-manager versions).
 */
export function listTopLevelPackages(nodeModulesDir) {
  let entries;
  try {
    entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      // Scope directory: one level deeper, still top-level packages.
      let scoped;
      try {
        scoped = fs.readdirSync(path.join(nodeModulesDir, entry.name), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const inner of scoped) {
        if (!inner.isDirectory() && !inner.isSymbolicLink()) continue;
        if (inner.name.startsWith(".")) continue;
        out.push({
          name: `${entry.name}/${inner.name}`,
          dir: path.join(nodeModulesDir, entry.name, inner.name),
        });
      }
      continue;
    }
    out.push({ name: entry.name, dir: path.join(nodeModulesDir, entry.name) });
  }
  return out;
}

/** Read a package's manifest, or null when it is missing/unreadable. */
export function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

/** The entry path a package declares, or null when it is not an engine package. */
export function markerPath(manifest) {
  const marker = manifest?.[MARKER_KEY]?.[MARKER_FIELD];
  return typeof marker === "string" && marker.trim() !== "" ? marker.trim() : null;
}

/**
 * Resolve the declared entry inside the package. Refuses to climb out of the
 * package directory: a marker of "../../evil.js" must not load a file we did not
 * install.
 */
export function resolveEntry(packageDir, entry) {
  const resolved = path.resolve(packageDir, entry);
  const root = path.resolve(packageDir);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`entry "${entry}" points outside the package`);
  }
  return resolved;
}

/** Shape check on the exported object; returns a reason string or null when valid. */
export function validateEngine(engine, builtinIds, seenIds) {
  if (engine === null || typeof engine !== "object") return "entry module does not export freeSearchEngine";
  const id = engine.id;
  if (typeof id !== "string" || id.trim() === "") return "engine id is missing";
  if (/^(auto|multi)$/.test(id)) return `engine id "${id}" is a routing mode, not an engine`;
  if (builtinIds.includes(id)) return `engine id "${id}" is already a built-in engine`;
  if (seenIds.has(id)) return `engine id "${id}" is already provided by another external package`;
  if (Number(engine.apiVersion) !== EXTERNAL_API_VERSION) {
    return `apiVersion ${engine.apiVersion ?? "?"} is not supported by this build (expected ${EXTERNAL_API_VERSION})`;
  }
  if (typeof engine.search !== "function") return "engine.search is not a function";
  if (typeof engine.time !== "boolean") return "engine.time must be a boolean";
  if (engine.requiresKey !== undefined && !Array.isArray(engine.requiresKey)) {
    return "engine.requiresKey must be an array of credential names";
  }
  const label = engine.label;
  if (label === null || typeof label !== "object") return "engine.label is missing";
  if (typeof label.en !== "string" || label.en.trim() === "") return "engine.label.en is required";
  return null;
}

/**
 * Load one package. Returns { engine, id, packageName } or { failure }.
 * `importModule` is injectable so tests can supply modules without writing files.
 */
export async function loadExternalEngine(packageName, packageDir, builtinIds, seenIds, importModule = (url) => import(url)) {
  const manifest = readManifest(packageDir);
  if (manifest === null) return { failure: { packageName, reason: "package.json is missing or unreadable" } };
  const entry = markerPath(manifest);
  if (entry === null) return { skipped: true };

  let entryPath;
  try {
    entryPath = resolveEntry(packageDir, entry);
  } catch (error) {
    return { failure: { packageName, reason: String(error?.message ?? error) } };
  }
  if (!fs.existsSync(entryPath)) {
    return { failure: { packageName, reason: `entry "${entry}" does not exist` } };
  }

  let mod;
  try {
    mod = await importModule(pathToFileURL(entryPath).href);
  } catch (error) {
    // A broken engine must never take the plugin down with it.
    return { failure: { packageName, reason: `import failed: ${String(error?.message ?? error)}` } };
  }

  const engine = mod?.freeSearchEngine;
  const reason = validateEngine(engine, builtinIds, seenIds);
  if (reason !== null) {
    const claimed = typeof engine?.id === "string" ? engine.id : undefined;
    return { failure: { packageName, id: claimed, reason } };
  }
  seenIds.add(engine.id);
  return {
    engine: {
      id: engine.id,
      label: { zh: engine.label.zh ?? engine.label.en, en: engine.label.en },
      time: engine.time,
      requiresKey: Array.isArray(engine.requiresKey) ? engine.requiresKey.map(String) : [],
      link: typeof engine.link === "string" ? engine.link : null,
      search: engine.search,
      packageName,
    },
  };
}

/**
 * Scan a profile for external engines.
 *
 * `profileDir` is the profile folder (`<dsh home>/profiles/<name>`), so the scan
 * root is its `node_modules`. Both install shapes land there: `pnpm add` writes a
 * real directory, `pnpm link` a symlink.
 */
export async function discoverExternalEngines({ profileDir, builtinIds = [], importModule, logger } = {}) {
  const engines = [];
  const failures = [];
  if (typeof profileDir !== "string" || profileDir === "") {
    return { engines, failures };
  }
  const nodeModules = path.join(profileDir, "node_modules");
  const seenIds = new Set();

  for (const candidate of listTopLevelPackages(nodeModules)) {
    if (candidate.name === SELF_PACKAGE) continue;
    const result = await loadExternalEngine(candidate.name, candidate.dir, builtinIds, seenIds, importModule);
    if (result?.skipped) continue;
    if (result?.failure) {
      failures.push(result.failure);
      logger?.warn?.(`free-search: external engine "${candidate.name}" skipped — ${result.failure.reason}`);
      continue;
    }
    engines.push(result.engine);
  }
  return { engines, failures };
}

/**
 * Credentials an external engine declares, split into the shape `resolveApiKey`
 * wants. Anything not declared is never resolved, so a package cannot ask us for
 * another engine's key.
 */
export function externalCredentialNames(engine) {
  return Array.isArray(engine?.requiresKey) ? engine.requiresKey.slice() : [];
}

/**
 * The controlled context handed to `engine.search`. Deliberately narrow: no
 * config object (it holds every API key the user configured), no settings write
 * access, no credential center.
 */
export function searchContext({ query, maxResults, timeRange, keys, fetch, signal }) {
  return {
    query,
    maxResults,
    timeRange,
    // Only the credentials this engine declared; `keys` is already filtered by the caller.
    key: Object.values(keys ?? {})[0] ?? "",
    keys: { ...keys },
    fetch,
    signal,
  };
}

/** Coerce whatever an engine returned into our result shape, or null when unusable. */
export function normalizeEngineResult(result, cap) {
  if (result === null || typeof result !== "object") return null;
  const rows = result.sources;
  if (!Array.isArray(rows)) return null;
  const sources = [];
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url) continue;
    const source = { url, title: String(row.title ?? ""), snippet: String(row.snippet ?? "") };
    if (typeof row.publishedAt === "string" && row.publishedAt) source.publishedAt = row.publishedAt;
    sources.push(source);
    if (sources.length >= cap) break;
  }
  return { sources, truncated: result.truncated === true };
}
