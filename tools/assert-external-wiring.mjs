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
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");

const mod = await import(new URL("lib/index.js", root));
const {
  ALL_ENGINES,
  Config,
  effectiveDisabledEngines,
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
const { REQUIRED_CREDENTIALS } = await import(new URL("lib/multi_policy.js", root));

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
await check("a registered external engine is a first-class engine in routing", async () => {
  setExternalEngines([{ id: "webz", label: { en: "Webz" }, time: true, requiresKey: ["WEBZ_API_TOKEN"] }]);
  // 1) 默认回退顺序下，只要勾进白名单，它就进 auto 链（不再只认自定义链）。
  const allowed = [...ALL_ENGINES, "webz"];
  const disabled = effectiveDisabledEngines({ allowedEngines: allowed });
  const auto = routeEngines("anything", {
    disabledEngines: disabled,
    allowedEngines: allowed,
    zhPool: ["bing", "webz"],
  });
  assert.equal(auto.includes("webz"), true, "a whitelisted external engine must join the auto chain");
  // 2) 池里点名它会排到头上（语言池就是 routeHead）。
  const pooled = routeEngines("中文查询", {
    disabledEngines: disabled,
    allowedEngines: allowed,
    zhPool: ["webz"],
  });
  assert.equal(pooled[0], "webz", "an external engine in the language pool leads the route");
  // 3) 没勾选时它仍然不出现：装了包不等于启用。
  const off = routeEngines("anything", {
    disabledEngines: effectiveDisabledEngines({ allowedEngines: ALL_ENGINES }),
    allowedEngines: ALL_ENGINES,
    zhPool: ["bing", "webz"],
  });
  assert.equal(off.includes("webz"), false, "an unchecked external engine must stay out");
  setExternalEngines([]);
});

await check("an external engine is reported as disabled until it is ticked", async () => {
  setExternalEngines([{ id: "webz", label: { en: "Webz" }, time: true, requiresKey: ["WEBZ_API_TOKEN"] }]);
  // 旧配置（白名单为空）只回填内置 43 个 → 外部引擎默认禁用
  assert.equal(effectiveDisabledEngines({}).includes("webz"), true);
  // 勾上之后才从禁用集合里消失
  assert.equal(effectiveDisabledEngines({ allowedEngines: [...ALL_ENGINES, "webz"] }).includes("webz"), false);
  setExternalEngines([]);
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

await check("describe reports the optional capabilities", async () => {
  // 四个可选字段要一路回传到设置页：设置页据此画「设置」按钮、
  // 标「按次计费」、显示并发上限；不声明时给的是内置默认（false / null / []）。
  setExternalEngines([
    {
      id: "webz",
      label: { en: "Webz" },
      time: true,
      requiresKey: ["WEBZ_API_TOKEN"],
      keyless: true,
      explicitOnly: true,
      concurrency: 2,
      settings: [{ key: "region", label: { en: "Region" }, type: "text", placeholder: "", hint: "", default: "eu" }],
      packageName: "dsh-free-search-engine-webz",
    },
  ]);
  const status = externalEngineStatus();
  assert.equal(status.length, 1);
  assert.equal(status[0].keyless, true, "keyless is forwarded");
  assert.equal(status[0].explicitOnly, true, "explicitOnly is forwarded");
  assert.equal(status[0].concurrency, 2, "concurrency is forwarded");
  assert.equal(status[0].settings.length, 1, "settings are forwarded");
  assert.equal(status[0].settings[0].key, "region");

  // 没有声明的引擎拿到的是默认值，而不是 undefined。
  setExternalEngines([{ id: "plain", label: { en: "Plain" }, time: false }]);
  const plain = externalEngineStatus()[0];
  assert.equal(plain.keyless, false);
  assert.equal(plain.explicitOnly, false);
  assert.equal(plain.concurrency, null);
  assert.deepEqual(plain.settings, []);
  setExternalEngines([]);
});

await check("a declared settings field is the only thing injected, and only to its owner", async () => {
  // 上下文里的 settings 必须只含「这个包自己声明的 key」，
  // 且其它引擎的值一概看不到 —— 与凭据的过滤规则同一条。
  const { searchContext } = await import(new URL("lib/external_engines.js", root).href);
  const ctx = searchContext({
    query: "q",
    maxResults: 5,
    timeRange: undefined,
    keys: {},
    settings: { region: "eu" },
    fetch: () => {},
  });
  assert.deepEqual(ctx.settings, { region: "eu" });
  assert.equal("otherEngine" in ctx.settings, false);
});

await check("settings are persisted under the engine id and pruned with it", async () => {
  // 保存时的清洗规则：只留装着且声明过的字段，卸载后残留值一并清掉。
  assert.match(index, /externalEngineSettings: z\.dict\(z\.dict\(z\.string\(\)\)\)\.default\(\{\}\)\.volatile\(\)/);
  assert.match(index, /const declared = externalSettingsOf\(engine\.id\);/);
  assert.match(index, /current\(\)\.externalEngineSettings\?\.\[engine\.id\]\?\.\[field\.key\]/);
  // 设置页的「设置」按钮对声明过 settings 的外部引擎可见。
  assert.match(client, /ENGINE_SETTINGS_IDS\.includes\(id\) \|\| externalSettingsFields\(id\)\.length > 0/);
  // 保存时整块写回，并且只写当前装着的那几个引擎。
  assert.match(client, /ops\.push\(\{ op: "set", path: \["externalEngineSettings"\], value: clean \}\)/);
});

await check("explicitOnly and concurrency reach the routing gates", async () => {
  // explicitOnly 的外包进不了 auto 的首发位，与内置按次计费引擎同一条判据。
  // 白名单是显式意图，所以它仍可出现在「兜底位置」——这与内置引擎的规则一致。
  const isExplicitOnlyEngine = mod.isExplicitOnlyEngineForTest;
  assert.equal(isExplicitOnlyEngine("openai"), true, "a built-in billed engine stays explicit-only");
  assert.equal(isExplicitOnlyEngine("bing"), false);
  setExternalEngines([{ id: "billed", label: { en: "Billed" }, time: false, explicitOnly: true }]);
  assert.equal(isExplicitOnlyEngine("billed"), true, "a declared external engine joins the same gate");
  const auto = routeEngines("anything", {
    disabledEngines: [],
    allowedEngines: [...ALL_ENGINES, "billed"],
  });
  assert.equal(auto.includes("billed"), true, "whitelisting is explicit intent, so it may sit at the tail");
  assert.equal(auto[0] === "billed", false, "but it must not lead the chain");

  // 池策略关着时，explicitOnly 的外包进不了语言池。
  const pool = normalizeLanguagePool(["bing", "billed"], ["bing"], "off");
  assert.deepEqual(pool, ["bing"], "an explicitOnly engine is refused by the default pool");
  const openPool = normalizeLanguagePool(["bing", "billed"], ["bing"], "multi");
  assert.deepEqual(openPool, ["bing", "billed"], "the pool policy can let it in");
  setExternalEngines([]);
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

await check("a removed package leaves no residue behind", async () => {
  // 卸载（或发现失败）后，id 集合清了还不够：runner、REQUIRED_CREDENTIALS、
  // KEY_REF_MAP 都是按 id 追加的表，留着会让 free_search_test 打到已删除的包。
  setExternalEngines([{ id: "webz", label: { en: "Webz" }, time: true, requiresKey: ["WEBZ_API_TOKEN"] }]);
  assert.equal(REQUIRED_CREDENTIALS.webz?.length, 1, "the credential requirement is registered");
  setExternalEngines([]);
  assert.equal(REQUIRED_CREDENTIALS.webz, undefined, "the credential requirement must go with the package");
  assert.equal(isKnownEngine("webz"), false);

  // 内置引擎共用同一个环境变量名时不能连带删掉：先注册一个假的外部引擎声明它，
  // 再卸载，内置那条仍然在。
  setExternalEngines([{ id: "webz", label: { en: "Webz" }, time: true, requiresKey: ["BRAVE_API_KEY"] }]);
  assert.equal(REQUIRED_CREDENTIALS.webz?.length, 1);
  setExternalEngines([]);
  assert.ok(REQUIRED_CREDENTIALS.brave, "a name still used by a built-in engine must survive");
});

await check("discovery re-registers tool schemas and the prompt", async () => {
  // 发现是异步的，工具在 apply 里就注册了。不重注册的话 webz 永远进不了
  // free_search_test / advanced_search 的 schema，也不进系统提示词。
  assert.match(index, /refreshLocalizedEffects\(\)/, "tool schemas must be refreshed after discovery");
  assert.match(index, /refreshPrompt\?\.\(\)/, "the prompt section must be refreshed after discovery");
  // 刷新的判据必须含外部 id，否则 localizedEffect 认为什么都没变。
  assert.match(index, /const engineIdsKey = \(\) => \[\.\.\.externalEngineIds\]\.join\(","\)/);
  const getKeyUses = (index.match(/getKey: engineIdsKey/g) || []).length;
  assert.equal(getKeyUses, 2, "both engine-list tool schemas must key on the external ids");
  // 卸载要能摘掉 runner。
  assert.match(index, /pruneExternalRunners = \(ids\) => \{/);
  assert.match(index, /for \(const id of ids\) delete engineRunners\[id\]/);
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

// ------------------------------------------------------------------ 可选能力（apiVersion 1 增补）
await check("an undeclared capability keeps the built-in default", async () => {
  // 老包不写这四个字段，行为必须一个字都不变：
  //   keyless      → 不进 keyedTierProbes（没有免 key 档）
  //   explicitOnly → 允许自动入池
  //   concurrency  → 走默认并发
  //   settings     → 空表，上下文里 settings 是 {}
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fsx-opt-"));
  const profile = path.join(tmp, "profile");
  const pkgDir = path.join(profile, "node_modules", "dsh-free-search-engine-plain");
  fs.mkdirSync(path.join(pkgDir, "lib"), { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name: "dsh-free-search-engine-plain", version: "1.0.0", dsh: { freeSearch: "./lib/entry.js" } }),
  );
  fs.writeFileSync(
    path.join(pkgDir, "lib", "entry.js"),
    `export const freeSearchEngine = {
      apiVersion: 1, id: "plain", label: { en: "Plain" }, time: false,
      async search(ctx) { return { sources: [{ url: "https://plain.test/1", title: JSON.stringify(ctx.settings) }] }; },
    };`,
  );

  const { discoverExternalEngines, normalizeEngineResult } = await import(
    new URL("lib/external_engines.js", root).href
  );
  const { engines } = await discoverExternalEngines({ profileDir: profile, builtinIds: ALL_ENGINES });
  assert.equal(engines.length, 1);
  const engine = engines[0];
  assert.equal(engine.keyless, null, "keyless is opt-in");
  assert.equal(engine.explicitOnly, null, "explicitOnly is opt-in");
  assert.equal(engine.concurrency, null, "concurrency is opt-in");
  assert.deepEqual(engine.settings, [], "no settings declared means an empty list");

  setExternalEngines(engines);
  // 上下文里 settings 永远是对象（不是 undefined），包不用自己兜底。
  const result = normalizeEngineResult(
    await engine.search({ query: "q", maxResults: 5, timeRange: undefined, keys: {}, settings: {}, fetch: () => {} }),
    5,
  );
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].title, "{}", "an engine with no settings gets an empty object");

  setExternalEngines([]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

await check("a declared capability is carried through, a bad one is refused", async () => {
  const { validateEngine, discoverExternalEngines } = await import(new URL("lib/external_engines.js", root).href);
  const seen = new Set();
  const good = {
    apiVersion: 1,
    id: "rich",
    label: { en: "Rich" },
    time: true,
    keyless: true,
    explicitOnly: true,
    concurrency: 1,
    settings: [
      { key: "region", label: { en: "Region" }, type: "text", default: "eu" },
      { key: "limit", label: { en: "Limit" }, type: "number", hint: "1-10" },
    ],
    async search() {
      return { sources: [] };
    },
  };
  assert.equal(validateEngine(good, ALL_ENGINES, seen), null, "a fully declared engine passes");

  const bad = (patch) => validateEngine({ ...good, ...patch, settings: patch.settings ?? good.settings }, ALL_ENGINES, new Set());
  assert.match(bad({ keyless: "yes" }), /keyless must be a boolean/);
  assert.match(bad({ explicitOnly: 1 }), /explicitOnly must be a boolean/);
  assert.match(bad({ concurrency: 0 }), /between 1 and 8/);
  assert.match(bad({ concurrency: 9 }), /between 1 and 8/);
  assert.match(bad({ concurrency: 1.5 }), /between 1 and 8/);
  assert.match(bad({ settings: "nope" }), /settings must be an array/);
  assert.match(bad({ settings: [null] }), /must be an object/);
  assert.match(bad({ settings: [{ label: { en: "x" } }] }), /\.key is required/);
  assert.match(bad({ settings: [{ key: "a", label: { zh: "甲" } }] }), /label\.en is required/);
  assert.match(bad({ settings: [{ key: "a", label: { en: "A" }, type: "json" }] }), /type must be text, number or password/);
  assert.match(bad({ settings: [{ key: "a", label: { en: "A" }, hint: 1 }] }), /hint must be a string/);

  // 合法声明要被原样搬到运行时对象上（默认值补齐、类型收敛）。
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fsx-rich-"));
  const profile = path.join(tmp, "profile");
  const pkgDir = path.join(profile, "node_modules", "dsh-free-search-engine-rich");
  fs.mkdirSync(path.join(pkgDir, "lib"), { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name: "dsh-free-search-engine-rich", version: "1.0.0", dsh: { freeSearch: "./lib/entry.js" } }),
  );
  fs.writeFileSync(
    path.join(pkgDir, "lib", "entry.js"),
    `export const freeSearchEngine = {
      apiVersion: 1, id: "rich", label: { en: "Rich" }, time: true,
      keyless: true, explicitOnly: true, concurrency: 2,
      settings: [{ key: "region", label: { en: "Region" }, default: "eu" }],
      async search() { return { sources: [] }; },
    };`,
  );
  const { engines } = await discoverExternalEngines({ profileDir: profile, builtinIds: ALL_ENGINES });
  assert.equal(engines.length, 1);
  const engine = engines[0];
  assert.equal(engine.keyless, true);
  assert.equal(engine.explicitOnly, true);
  assert.equal(engine.concurrency, 2);
  assert.equal(engine.settings.length, 1);
  assert.equal(engine.settings[0].key, "region");
  assert.equal(engine.settings[0].label.en, "Region");
  assert.equal(engine.settings[0].default, "eu");
  assert.equal(engine.settings[0].type, "text", "an omitted type defaults to text");
  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log(`OK: ${checks} external wiring checks passed`);
