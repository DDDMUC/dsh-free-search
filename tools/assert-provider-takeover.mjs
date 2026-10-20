// Provider takeover + registration idempotence across DSH web APIs. No network or API key.
// Node >= 20: node tools/assert-provider-takeover.mjs
import assert from "node:assert/strict";

const { apply, ALL_ENGINES } = await import("../lib/index.js");
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`  ok  ${name}`); };
const checkAsync = async (name, fn) => { await fn(); checks++; console.log(`  ok  ${name}`); };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const baseConfig = () => ({
  provider: "bing",
  cache: false,
  disabledEngines: ALL_ENGINES.filter((engine) => engine !== "bing" && engine !== "ddg"),
});

function makeCtx({ searchProvider, fetchProvider, hasConfigRefs = false, duplicateRegisters = false, describeValue = null, describeUid = null } = {}) {
  const mutations = [];
  const registrations = { search: 0, fetch: 0 };
  const handlers = {};
  const described = { value: describeValue, uid: describeUid };
  const settings = {
    mutate: async (ns, ops) => { mutations.push({ ns, ops }); },
    configure() {},
    describe: () => (described.value === null ? [] : [{ ns: "web", value: described.value, schema: { uid: described.uid } }]),
  };
  const duplicate = (what) => Object.assign(new Error(`a web provider with id "${what}" is already registered`), { code: "WEB_DUPLICATE_PROVIDER" });
  const web = {
    registerSearchProvider() {
      registrations.search++;
      if (duplicateRegisters) throw duplicate("ddg");
    },
    registerFetchProvider() {
      registrations.fetch++;
      if (duplicateRegisters) throw duplicate("fs-quality-fetch");
    },
  };
  if (hasConfigRefs) {
    web.config = {};
    if (searchProvider !== undefined) web.config.searchProvider = { get: () => searchProvider };
    if (fetchProvider !== undefined) web.config.fetchProvider = { get: () => fetchProvider };
  } else {
    if (searchProvider !== undefined) web.searchProviderId = searchProvider;
    if (fetchProvider !== undefined) web.fetchProviderId = fetchProvider;
  }
  const logs = [];
  const ctx = {
    logger: { info: (...args) => logs.push(args.join(" ")), warn: (...args) => logs.push(args.join(" ")) },
    get() { return undefined; },
    inject(deps, callback) {
      if (Array.isArray(deps) && deps.includes("settings")) {
        callback({ settings, effect: () => () => {}, on: (event, handler) => { handlers[event] = handler; } });
      }
    },
    web,
  };
  return { ctx, web, mutations, registrations, logs, handlers, described };
}

function run(options = {}) {
  const { config, ...rest } = options;
  const { ctx, web, mutations, registrations, logs } = makeCtx(rest);
  apply(ctx, { ...baseConfig(), ...(config ?? {}) });
  return { web, mutations: mutations.filter((entry) => entry.ns === "web"), registrations, logs };
}

check("legacy API: an unset searchProvider is taken over", () => {
  const { web } = run({});
  assert.equal(web.searchProviderId, "ddg");
});

check("legacy API: the factory default deepseek-official is replaced", () => {
  const { web } = run({ searchProvider: "deepseek-official", fetchProvider: "http" });
  assert.equal(web.searchProviderId, "ddg");
  assert.equal(web.fetchProviderId, "fs-quality-fetch");
});

check("legacy API: an explicit foreign provider is left alone", () => {
  const { web } = run({ searchProvider: "someone-else", fetchProvider: "someone-else" });
  assert.equal(web.searchProviderId, "someone-else");
  assert.equal(web.fetchProviderId, "someone-else");
});

check("rc.2 API: the takeover goes through a single settings.mutate(web)", () => {
  const { mutations } = run({ searchProvider: "deepseek-official", fetchProvider: "http", hasConfigRefs: true });
  assert.equal(mutations.length, 1);
  assert.deepEqual(mutations[0].ops, [
    { op: "set", path: ["fetchProvider"], value: "fs-quality-fetch" },
    { op: "set", path: ["searchProvider"], value: "ddg" },
  ]);
});

check("rc.2 API: no takeover when a foreign provider is selected", () => {
  const { mutations } = run({ searchProvider: "someone-else", fetchProvider: "someone-else", hasConfigRefs: true });
  assert.equal(mutations.length, 0);
});

check("rc.2 API: an explicit plugin id is not rewritten", () => {
  const { mutations } = run({ searchProvider: "ddg", fetchProvider: "fs-quality-fetch", hasConfigRefs: true });
  assert.equal(mutations.length, 0);
});

check("legacy API: fetchProviderTakeover=false leaves an explicit http alone", () => {
  const { web } = run({
    searchProvider: "deepseek-official",
    fetchProvider: "http",
    config: { fetchProviderTakeover: false },
  });
  assert.equal(web.searchProviderId, "ddg");
  assert.equal(web.fetchProviderId, "http");
});

check("legacy API: fetchProviderTakeover=false still fills an unset provider", () => {
  const { web } = run({ config: { fetchProviderTakeover: false } });
  assert.equal(web.fetchProviderId, "fs-quality-fetch");
});

check("re-entering apply on the same context is a no-op", () => {
  const { ctx, registrations } = makeCtx();
  apply(ctx, baseConfig());
  apply(ctx, baseConfig());
  apply(ctx, baseConfig());
  assert.deepEqual(registrations, { search: 1, fetch: 1 });
});

check("duplicate registrations from another context do not abort apply", () => {
  const { ctx, registrations } = makeCtx({ duplicateRegisters: true });
  apply(ctx, baseConfig());
  assert.equal(registrations.search, 1);
  assert.equal(registrations.fetch, 1);
});

check("repeated takeover logs are deduplicated per process", () => {
  const foreign = "someone-else-" + Date.now();
  const first = run({ searchProvider: foreign, fetchProvider: foreign });
  assert.ok(first.logs.length > 0, "the takeover should log at least once");
  const second = run({ searchProvider: foreign, fetchProvider: foreign });
  assert.equal(second.logs.length, 0, "the same messages must not be logged twice");
});

await checkAsync("#82 diagnostic ignores describe()-triggered noise", async () => {
  const { ctx, handlers, logs } = makeCtx({
    searchProvider: "ddg",
    fetchProvider: "fs-quality-fetch",
    hasConfigRefs: true,
    describeValue: { searchProvider: "ddg", fetchProvider: "fs-quality-fetch", cache: true },
    describeUid: 94,
  });
  apply(ctx, baseConfig());
  handlers["settings/document-updated"]("web");
  await tick();
  handlers["settings/document-updated"]("web");
  await tick();
  assert.equal(logs.filter((entry) => entry.includes("the web entry changed")).length, 0);
});

await checkAsync("#82 diagnostic reports a nested config change", async () => {
  const { ctx, handlers, described, logs } = makeCtx({
    searchProvider: "ddg",
    fetchProvider: "fs-quality-fetch",
    hasConfigRefs: true,
    describeValue: { cache: true, providers: { search: "ddg" } },
    describeUid: 94,
  });
  apply(ctx, baseConfig());
  handlers["settings/document-updated"]("web");
  await tick();
  described.value = { cache: true, providers: { search: "someone-else" } };
  handlers["settings/document-updated"]("web");
  await tick();
  const line = logs.find((entry) => entry.includes("the web entry changed"));
  assert.ok(line, "the change must be logged");
  assert.match(line, /config providers\.search: "ddg" → "someone-else"/);
  assert.doesNotMatch(line, /cache/);
});

await checkAsync("#82 diagnostic reports a web service rebuild", async () => {
  const { ctx, handlers, described, logs } = makeCtx({
    searchProvider: "ddg",
    fetchProvider: "fs-quality-fetch",
    hasConfigRefs: true,
    describeValue: { searchProvider: "ddg", fetchProvider: "fs-quality-fetch" },
    describeUid: 94,
  });
  apply(ctx, baseConfig());
  handlers["settings/document-updated"]("web");
  await tick();
  described.uid = 95;
  handlers["settings/document-updated"]("web");
  await tick();
  const line = logs.find((entry) => entry.includes("the web entry changed"));
  assert.ok(line, "the rebuild must be logged");
  assert.match(line, /entry uid 94 → 95/);
});

await checkAsync("#86 reclaims the shipped default after DSH's search switch is turned off", async () => {
  const { ctx, handlers, described, mutations } = makeCtx({
    searchProvider: "ddg",
    fetchProvider: "fs-quality-fetch",
    hasConfigRefs: true,
    describeValue: { searchProvider: "ddg", fetchProvider: "fs-quality-fetch" },
    describeUid: 94,
  });
  apply(ctx, baseConfig());
  handlers["settings/document-updated"]("web");
  await tick();
  // 关掉 DSH 的「DeepSeek 搜索 API」开关：整行 web 被删，provider 回到出厂默认
  described.value = { searchProvider: "deepseek-official", fetchProvider: "http" };
  handlers["settings/document-updated"]("web");
  await tick();
  await tick();
  const ops = mutations.filter((entry) => entry.ns === "web").flatMap((entry) => entry.ops);
  assert.equal(ops.find((op) => op.path?.[0] === "searchProvider")?.value, "ddg");
  assert.equal(ops.find((op) => op.path?.[0] === "fetchProvider")?.value, "fs-quality-fetch");
});

await checkAsync("#86 never fights an explicit deepseek-search-api choice", async () => {
  const { ctx, handlers, described, mutations } = makeCtx({
    searchProvider: "ddg",
    fetchProvider: "fs-quality-fetch",
    hasConfigRefs: true,
    describeValue: { searchProvider: "ddg", fetchProvider: "fs-quality-fetch" },
    describeUid: 94,
  });
  apply(ctx, baseConfig());
  handlers["settings/document-updated"]("web");
  await tick();
  described.value = { searchProvider: "deepseek-search-api", fetchProvider: "deepseek-fetch-api" };
  handlers["settings/document-updated"]("web");
  await tick();
  await tick();
  assert.equal(mutations.filter((entry) => entry.ns === "web").length, 0);
});

console.log(`OK: ${checks} provider takeover checks passed`);
