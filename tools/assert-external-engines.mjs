// External engine discovery and isolation (phase 1 of the extension point).
//
// Everything here is offline: fixture packages are written into a temp folder,
// and `importModule` is injected so a fake module never has to exist on disk.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  discoverExternalEngines,
  externalCredentialNames,
  listTopLevelPackages,
  markerPath,
  normalizeEngineResult,
  readManifest,
  resolveEntry,
  searchContext,
  validateEngine,
} from "../lib/external_engines.js";

let checks = 0;
// `fn` may be async: awaiting it here keeps failures local to the check instead
// of surfacing as an unhandled rejection after the summary printed "OK".
const check = async (name, fn) => {
  await fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fsx-ext-"));
const cleanup = () => fs.rmSync(tmpRoot, { recursive: true, force: true });
process.on("exit", cleanup);

/** Write a fixture package; `entry` is the module source, null = no marker. */
function writePackage(nodeModules, name, { marker = true, manifest = {}, entry = null } = {}) {
  const dir = path.join(nodeModules, ...name.split("/"));
  fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
  const pkg = { name, version: "1.0.0", ...manifest };
  if (marker) pkg.dsh = { freeSearch: "./lib/entry.js" };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  if (entry !== null) fs.writeFileSync(path.join(dir, "lib", "entry.js"), entry);
  return dir;
}

const profile = path.join(tmpRoot, "profile");
const nodeModules = path.join(profile, "node_modules");

// ------------------------------------------------------------------ 发现
await check("a package with the marker is found, without it is ignored", async () => {
  fs.mkdirSync(nodeModules, { recursive: true });
  writePackage(nodeModules, "dsh-free-search-engine-fake", {
    entry: `export const freeSearchEngine = {
      apiVersion: 1, id: "fake", label: { zh: "假引擎", en: "Fake" }, time: true,
      requiresKey: ["FAKE_TOKEN"],
      async search() { return { sources: [] }; },
    };`,
  });
  writePackage(nodeModules, "not-an-engine", { entry: `export const nope = 1;` });

  const { engines } = await discoverExternalEngines({ profileDir: profile, builtinIds: ["bing"] });
  assert.equal(engines.length, 1, `expected one engine, got ${engines.length}`);
  assert.equal(engines[0].id, "fake");
  assert.equal(engines[0].label.zh, "假引擎");
  assert.deepEqual(engines[0].requiresKey, ["FAKE_TOKEN"]);
});

await check("scoped packages are found, hidden folders and .pnpm are not", async () => {
  fs.mkdirSync(path.join(nodeModules, "@scope", "eng"), { recursive: true });
  fs.writeFileSync(
    path.join(nodeModules, "@scope", "eng", "package.json"),
    JSON.stringify({ name: "@scope/eng", version: "1.0.0" }),
  );
  fs.mkdirSync(path.join(nodeModules, ".pnpm"), { recursive: true });
  fs.mkdirSync(path.join(nodeModules, ".cache"), { recursive: true });

  const names = listTopLevelPackages(nodeModules).map((entry) => entry.name);
  assert.ok(names.includes("@scope/eng"), "scoped package missing");
  assert.ok(names.includes("dsh-free-search-engine-fake"));
  assert.equal(names.some((n) => n.startsWith(".pnpm") || n.startsWith(".cache")), false, "hidden dirs leaked");
});

// ------------------------------------------------------------------ 校验
await check("apiVersion must be 1", async () => {
  const engine = { apiVersion: 2, id: "x", search() {}, time: true, label: { en: "X" } };
  assert.match(validateEngine(engine, [], new Set()), /apiVersion 2 is not supported/);
});

await check("an id that collides with a built-in engine is refused", async () => {
  const engine = { apiVersion: 1, id: "bing", search() {}, time: false, label: { en: "X" } };
  assert.match(validateEngine(engine, ["bing"], new Set()), /already a built-in engine/);
});

await check("an id already taken by another external package is refused", async () => {
  const engine = { apiVersion: 1, id: "fake", search() {}, time: false, label: { en: "X" } };
  assert.match(validateEngine(engine, [], new Set(["fake"])), /already provided by another external package/);
});

await check("auto and multi are routing modes, not engines", async () => {
  for (const id of ["auto", "multi"]) {
    const engine = { apiVersion: 1, id, search() {}, time: false, label: { en: "X" } };
    assert.match(validateEngine(engine, [], new Set()), /routing mode/);
  }
});

await check("the shape must be complete", async () => {
  assert.match(validateEngine(null, [], new Set()), /does not export freeSearchEngine/);
  assert.match(validateEngine({ apiVersion: 1, id: "x", time: false, label: {} }, [], new Set()), /search is not a function/);
  assert.match(
    validateEngine({ apiVersion: 1, id: "x", search() {}, time: "yes", label: { en: "X" } }, [], new Set()),
    /time must be a boolean/,
  );
  assert.match(validateEngine({ apiVersion: 1, id: "x", search() {}, time: true, label: {} }, [], new Set()), /label.en is required/);
});

await check("a marker cannot point outside its package", async () => {
  const dir = path.join(tmpRoot, "escape");
  assert.throws(() => resolveEntry(dir, "../../evil.js"), /points outside the package/);
  assert.throws(() => resolveEntry(dir, "/etc/passwd"), /points outside the package/);
  assert.equal(resolveEntry(dir, "./lib/ok.js"), path.join(dir, "lib", "ok.js"));
});

await check("markerPath is empty for packages without the marker", async () => {
  assert.equal(markerPath(null), null);
  assert.equal(markerPath({}), null);
  assert.equal(markerPath({ dsh: {} }), null);
  assert.equal(markerPath({ dsh: { freeSearch: "   " } }), null);
  assert.equal(markerPath({ dsh: { freeSearch: "./lib/x.js" } }), "./lib/x.js");
});

// ------------------------------------------------------------------ 隔离
await check("an engine that throws on import is recorded, not thrown", async () => {
  writePackage(nodeModules, "dsh-free-search-engine-broken", {
    entry: `throw new Error("boom at module scope");`,
  });
  const { engines, failures } = await discoverExternalEngines({ profileDir: profile, builtinIds: ["bing"] });
  const broken = failures.find((f) => f.packageName === "dsh-free-search-engine-broken");
  assert.ok(broken, "the broken package should be reported");
  assert.match(broken.reason, /import failed: boom at module scope/);
  // The healthy engine still loads.
  assert.ok(engines.some((e) => e.id === "fake"), "one broken package must not stop the scan");
});

await check("two packages claiming the same id: exactly one wins, the other is refused", async () => {
  writePackage(nodeModules, "dsh-free-search-engine-dup", {
    entry: `export const freeSearchEngine = {
      apiVersion: 1, id: "fake", label: { en: "Dup" }, time: false,
      async search() { return { sources: [] }; },
    };`,
  });
  const { engines, failures } = await discoverExternalEngines({ profileDir: profile, builtinIds: ["bing"] });
  assert.equal(engines.filter((e) => e.id === "fake").length, 1, "the id must be claimed once");
  // Which package wins depends on directory scan order, so accept either:
  // what matters is that the loser is reported and the winner still loads.
  const refused = failures.find((f) => /already provided/.test(f.reason));
  assert.ok(refused, "the loser must be refused with a reason");
  assert.ok(
    refused.packageName === "dsh-free-search-engine-dup" || refused.packageName === "dsh-free-search-engine-fake",
    `unexpected loser: ${refused.packageName}`,
  );
  // The winner is one of the two, never both.
  const winner = engines.find((e) => e.id === "fake");
  assert.ok([ "dsh-free-search-engine-dup", "dsh-free-search-engine-fake" ].includes(winner.packageName));
});

await check("a missing entry file is a failure, not a crash", async () => {
  const dir = path.join(nodeModules, "dsh-free-search-engine-noentry");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "dsh-free-search-engine-noentry", version: "1.0.0", dsh: { freeSearch: "./lib/nope.js" } }),
  );
  const { failures } = await discoverExternalEngines({ profileDir: profile, builtinIds: ["bing"] });
  assert.ok(failures.some((f) => /does not exist/.test(f.reason)), "a missing entry should be reported");
});

await check("a bad result shape is rejected instead of leaking downstream", async () => {
  assert.equal(normalizeEngineResult(null, 10), null);
  assert.equal(normalizeEngineResult({}, 10), null, "no sources array");
  assert.equal(normalizeEngineResult({ sources: "nope" }, 10), null);
  const rows = normalizeEngineResult(
    { sources: [{ url: "https://a.test/1", title: "A" }, { url: "   " }, { title: "no url" }] },
    10,
  );
  assert.equal(rows.sources.length, 1, "rows without a url are dropped");
  assert.equal(rows.sources[0].snippet, "");
  const capped = normalizeEngineResult(
    { sources: Array.from({ length: 5 }, (_, i) => ({ url: `https://a.test/${i}` })) },
    2,
  );
  assert.equal(capped.sources.length, 2);
});

// ------------------------------------------------------------------ 注入
await check("the context is narrow: no cfg, no settings, no credential center", async () => {
  const ctx = searchContext({
    query: "q",
    maxResults: 5,
    timeRange: { days: 7 },
    keys: { WEBZ_API_TOKEN: "t" },
    fetch: () => {},
    signal: undefined,
  });
  assert.deepEqual(Object.keys(ctx).sort(), ["fetch", "key", "keys", "maxResults", "query", "signal", "timeRange"]);
  assert.equal(ctx.key, "t", "the single-key shortcut matches the only declared credential");
  assert.deepEqual(ctx.keys, { WEBZ_API_TOKEN: "t" });
  assert.equal("cfg" in ctx, false);
  assert.equal("settings" in ctx, false);
  assert.equal("credentials" in ctx, false);
});

await check("only declared credentials are ever resolved", async () => {
  const engine = { requiresKey: ["WEBZ_API_TOKEN"] };
  assert.deepEqual(externalCredentialNames(engine), ["WEBZ_API_TOKEN"]);
  assert.deepEqual(externalCredentialNames({}), []);
  const ctx = searchContext({ query: "q", maxResults: 5, timeRange: undefined, keys: {}, fetch: () => {} });
  assert.equal(ctx.key, "");
});

// ------------------------------------------------------------------ manifest
await check("a package without package.json does not crash the scan", async () => {
  fs.mkdirSync(path.join(nodeModules, "garbage-pkg"), { recursive: true });
  assert.equal(readManifest(path.join(nodeModules, "garbage-pkg")), null);
});

console.log(`OK: ${checks} external engine checks passed`);
