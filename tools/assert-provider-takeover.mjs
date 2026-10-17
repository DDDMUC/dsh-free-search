// Provider takeover across both DSH web APIs. No network or API key.
// Node >= 20: node tools/assert-provider-takeover.mjs
import assert from "node:assert/strict";

const { apply, ALL_ENGINES } = await import("../lib/index.js");
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`  ok  ${name}`); };

const baseConfig = () => ({
  provider: "bing",
  cache: false,
  disabledEngines: ALL_ENGINES.filter((engine) => engine !== "bing" && engine !== "ddg"),
});

function run({ searchProvider, fetchProvider, hasConfigRefs = false }) {
  const mutations = [];
  const settings = {
    mutate: async (ns, ops) => { mutations.push({ ns, ops }); },
    configure() {},
  };
  const web = {
    registerSearchProvider() {},
    registerFetchProvider() {},
  };
  if (hasConfigRefs) {
    web.config = {};
    if (searchProvider !== undefined) web.config.searchProvider = { get: () => searchProvider };
    if (fetchProvider !== undefined) web.config.fetchProvider = { get: () => fetchProvider };
  } else {
    if (searchProvider !== undefined) web.searchProviderId = searchProvider;
    if (fetchProvider !== undefined) web.fetchProviderId = fetchProvider;
  }
  const ctx = {
    logger: { info() {}, warn() {} },
    get() { return undefined; },
    inject(deps, callback) {
      if (Array.isArray(deps) && deps.includes("settings")) callback({ settings, effect: () => () => {}, on() {} });
    },
    web,
  };
  apply(ctx, baseConfig());
  return { web, mutations: mutations.filter((entry) => entry.ns === "web") };
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

console.log(`OK: ${checks} provider takeover checks passed`);
