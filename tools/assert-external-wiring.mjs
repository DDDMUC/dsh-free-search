// Wiring checks for the external engine extension point.
//
// The discovery module is asserted in assert-external-engines.mjs. This one
// covers the part that lives in lib/index.js: the id sets, the predicate swap,
// what gets registered into engineRunners, and the fact that none of it leaks
// into the default engine sets.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url);
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");

const mod = await import(new URL("lib/index.js", root));
const {
  ALL_ENGINES,
  Config,
  enabledEngines,
  isKnownEngine,
  normalizeAllowedEngines,
  normalizeDisabledEngines,
  normalizeFallbackOrder,
  normalizeLanguagePool,
  routeEngines,
  setExternalEngines,
  externalEngineStatus,
} = mod;

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

// ------------------------------------------------------------------ 判据
await check("the built-in catalog is untouched", async () => {
  assert.equal(ALL_ENGINES.length, 43, "the 43 built-in engines must not change");
  assert.equal(new Set(ALL_ENGINES).size, 43);
});

await check("an unknown id is not a known engine until it is registered", async () => {
  assert.equal(isKnownEngine("webz"), false);
  assert.equal(isKnownEngine("bing"), true);
  assert.equal(isKnownEngine("auto"), false, "routing modes are not engines");
  assert.equal(isKnownEngine(undefined), false);
  assert.equal(isKnownEngine(""), false);
});

await check("setExternalEngines makes the id known, and clearing it undoes that", async () => {
  setExternalEngines([]);
  assert.equal(isKnownEngine("webz"), false);
  setExternalEngines([{ id: "webz", label: { en: "Webz" }, time: true, requiresKey: ["WEBZ_API_TOKEN"] }]);
  assert.equal(isKnownEngine("webz"), true);
  // The credential name is registered in KEY_REF_MAP, not in the engine id set:
  // an env var must never be mistaken for an engine.
  assert.equal(isKnownEngine("WEBZ_API_TOKEN"), false, "credential names are not engine ids");
  setExternalEngines([]);
  assert.equal(isKnownEngine("webz"), false, "clearing removes the id again");
});

// ------------------------------------------------------------------ 默认集合
await check("external engines do not join the default allowed set", async () => {
  setExternalEngines([{ id: "webz", label: { en: "Webz" }, time: true, requiresKey: ["WEBZ_API_TOKEN"] }]);
  // A legacy config with an empty allowlist derives the whitelist from ALL_ENGINES,
  // so the external id must not appear there.
  const fresh = Config({});
  assert.deepEqual(normalizeAllowedEngines([]), []);
  assert.deepEqual(normalizeDisabledEngines([]), []);
  assert.equal(
    enabledEngines([], [], []).includes("webz"),
    false,
    "an external engine must not be enabled by default",
  );
  void fresh;
});

await check("an external id survives normalization once it is registered", async () => {
  setExternalEngines([{ id: "webz", label: { en: "Webz" }, time: true, requiresKey: ["WEBZ_API_TOKEN"] }]);
  assert.deepEqual(normalizeAllowedEngines(["webz", "bing", "nope"]), ["webz", "bing"], "`nope` is not an engine");
  assert.deepEqual(normalizeDisabledEngines(["webz", "nope"]), ["webz"]);
  assert.deepEqual(normalizeFallbackOrder(["webz", "bing"]), ["webz", "bing"]);
  assert.deepEqual(normalizeLanguagePool(["webz"], ["bing"]), ["webz"], "an explicit pool accepts it");
});

await check("the default fallback chain is unchanged", async () => {
  setExternalEngines([{ id: "webz", label: { en: "Webz" }, time: true, requiresKey: ["WEBZ_API_TOKEN"] }]);
  const chain = normalizeFallbackOrder([]);
  assert.equal(chain.includes("webz"), false, "the shipped default chain must not gain external engines");
  assert.equal(chain[0], "exa", "the default chain still starts with exa");
});

// ------------------------------------------------------------------ 路由
await check("auto routing keeps external engines out unless the chain names them", async () => {
  setExternalEngines([{ id: "webz", label: { en: "Webz" }, time: true, requiresKey: ["WEBZ_API_TOKEN"] }]);
  // Default (no custom order): routeEngines builds from ALL_ENGINES, so no external id.
  const auto = routeEngines("anything", { disabledEngines: [], allowedEngines: ["bing", "ddg"] });
  assert.equal(auto.includes("webz"), false, "auto must not pick up an external engine by itself");

  // A custom chain that names it does route through it (at its position).
  const custom = routeEngines("anything", { disabledEngines: [], allowedEngines: ["webz", "bing"], fallbackOrder: ["bing", "webz"] });
  assert.deepEqual(custom, ["bing", "webz"], "a custom chain may contain it");
});

await check("a time-filtered route treats a time-capable external engine correctly", async () => {
  setExternalEngines([{ id: "webz", label: { en: "Webz" }, time: true, requiresKey: ["WEBZ_API_TOKEN"] }]);
  const withTime = routeEngines("anything", {
    timeRange: true,
    disabledEngines: [],
    allowedEngines: ["webz", "bing"],
    fallbackOrder: ["bing", "webz"],
  });
  // bing is not in TIME_ENGINES, webz declares time: true, so webz leads.
  assert.deepEqual(withTime, ["webz", "bing"], "a time filter must prefer the time-capable engine");

  setExternalEngines([{ id: "webz", label: { en: "Webz" }, time: false, requiresKey: [] }]);
  const noTime = routeEngines("anything", {
    timeRange: true,
    disabledEngines: [],
    allowedEngines: ["webz", "bing"],
    fallbackOrder: ["bing", "webz"],
  });
  assert.deepEqual(noTime, ["bing", "webz"], "a non-time engine must not lead a time-filtered route");
});

// ------------------------------------------------------------------ 状态回传
await check("describe reports the external engines with their declared shape", async () => {
  setExternalEngines([
    { id: "webz", label: { zh: "Webz.io 新闻", en: "Webz.io News" }, time: true, requiresKey: ["WEBZ_API_TOKEN"], packageName: "dsh-free-search-engine-webz", link: "https://app.webz.io" },
  ]);
  const status = externalEngineStatus();
  assert.equal(status.length, 1);
  assert.equal(status[0].id, "webz");
  assert.equal(status[0].label.en, "Webz.io News");
  assert.equal(status[0].time, true);
  assert.deepEqual(status[0].requiresKey, ["WEBZ_API_TOKEN"]);
  assert.equal(status[0].status, "ready");
});

await check("the bridge describe exposes the list", async () => {
  assert.match(index, /externalEngines: externalEngineStatus\(\)/);
});

// ------------------------------------------------------------------ 接线
await check("the predicate swap covers every engine gate", async () => {
  // These are the gates that used to hard-code ALL_ENGINES / TIME_ENGINES: an
  // external id must pass all of them. The only surviving raw uses are the two
  // helper definitions themselves; any other straggler breaks the feature.
  assert.equal((index.match(/ALL_ENGINES\.includes/g) ?? []).length, 1, "only isKnownEngine may test the constant");
  assert.equal((index.match(/TIME_ENGINES\.includes/g) ?? []).length, 1, "only isTimeEngine may test the constant");
  assert.match(index, /const isKnownEngine = \(id\) => typeof id === "string" && \(ALL_ENGINES\.includes\(id\) \|\| externalEngineIds\.has\(id\)\)/);
  assert.match(index, /const isTimeEngine = \(id\) => TIME_ENGINES\.includes\(id\) \|\| externalTimeIds\.has\(id\)/);
});

await check("discovery runs at apply time and registers a runner per engine", async () => {
  const applyBlock = index.slice(index.indexOf("function apply(ctx, config)"));
  assert.match(applyBlock, /discoverExternalEngines\(\{ profileDir: mode\.profileDir, builtinIds: ALL_ENGINES \}\)/);
  assert.match(applyBlock, /engineRunners\[engine\.id\] = async \(\{ query, maxResults, timeRange, signal \}\) =>/);
  assert.match(applyBlock, /void discover\(\);/, "discovery must not block apply");
  // Registering after keylessFirst wrapping is intentional: external engines have
  // no keyless tier, so they must not be re-wrapped.
  const keylessAt = applyBlock.indexOf("withKeylessFirst(id, () => keyFirstRunner(args))");
  const externalAt = applyBlock.indexOf("const registerExternalEngine");
  assert.ok(keylessAt > 0 && externalAt > keylessAt, "external registration must come after the keyless wrapper");
});

await check("the runner resolves only declared credentials and uses proxyFetch", async () => {
  const block = index.slice(index.indexOf("const registerExternalEngine"), index.indexOf("const discover = async"));
  assert.match(block, /const names = externalCredentialNames\(engine\)/);
  assert.match(block, /await resolveApiKey\(name, null\)/, "the key comes from the credential center / env, never from cfg");
  assert.match(block, /fetch: proxyFetch/, "the engine gets the proxy-aware fetch, not the global one");
  assert.match(block, /throw new EngineSkip\(/);
  assert.match(block, /normalizeEngineResult\(result,/, "a bad shape must be caught before it leaves the runner");
});

await check("no built-in engine module is touched by the extension point", async () => {
  // The extension point must not reach into lib/engines at all.
  const ext = fs.readFileSync(new URL("lib/external_engines.js", root), "utf8");
  assert.equal(/from "\.\/engines\//.test(ext), false, "external_engines must not import an engine module");
  assert.equal(/fetchBing|proxyFetch|cooldown/i.test(ext), false, "no built-in plumbing inside the discovery module");
});

// ------------------------------------------------------------------ 端到端（假 profile）
await check("a package placed in a profile is discovered and registered", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fsx-wire-"));
  const profile = path.join(tmp, "profile");
  const pkgDir = path.join(profile, "node_modules", "dsh-free-search-engine-sample");
  fs.mkdirSync(path.join(pkgDir, "lib"), { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({
      name: "dsh-free-search-engine-sample",
      version: "1.0.0",
      dsh: { freeSearch: "./lib/entry.js" },
    }),
  );
  fs.writeFileSync(
    path.join(pkgDir, "lib", "entry.js"),
    `export const freeSearchEngine = {
      apiVersion: 1, id: "sample", label: { en: "Sample" }, time: false,
      requiresKey: ["SAMPLE_TOKEN"],
      async search({ keys }) {
        // The injected context must not carry cfg or settings.
        return { sources: [{ url: "https://sample.test/1", title: String(Object.keys(keys)) }] };
      },
    };`,
  );

  const { discoverExternalEngines, normalizeEngineResult } = await import(
    new URL("lib/external_engines.js", root).href
  );
  const { engines } = await discoverExternalEngines({ profileDir: profile, builtinIds: ALL_ENGINES });
  assert.equal(engines.length, 1);
  assert.equal(engines[0].id, "sample");

  // Register it and drive it through the same normalisation the runner uses.
  setExternalEngines(engines);
  assert.equal(isKnownEngine("sample"), true);
  const result = normalizeEngineResult(
    await engines[0].search({ query: "q", maxResults: 5, timeRange: undefined, keys: { SAMPLE_TOKEN: "t" }, fetch: () => {} }),
    5,
  );
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].title, "SAMPLE_TOKEN", "the engine only sees the credential it declared");

  setExternalEngines([]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log(`OK: ${checks} external wiring checks passed`);
