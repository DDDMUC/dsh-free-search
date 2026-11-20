// #152: billed explicit-only engines may join the zh/en language pools on
// purpose. Three levels: off (default, current behaviour), auto (Auto routing
// only), multi (Auto + the Multi concurrent pool).
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const {
  ALL_ENGINES,
  EXPLICIT_ONLY_ENGINES,
  buildCacheKey,
  normalizeLanguagePool,
  normalizePoolPolicy,
  routeEngines,
} = await import(new URL("lib/index.js", root));

const DEFAULT_ZH_POOL = ["bing", "baidu", "aliyun", "anysearch"];
const DEFAULT_EN_POOL = ["bing", "exa", "tavily"];

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const BILLED = ["openai", "gemini", "claude", "metaso", "yandex", "yuanbao", "specstream"];

check("all seven billed engines are covered", () => {
  assert.deepEqual([...EXPLICIT_ONLY_ENGINES].sort(), [...BILLED].sort());
});

check("the policy defaults to off and rejects unknown values", () => {
  assert.equal(normalizePoolPolicy(undefined), "off");
  assert.equal(normalizePoolPolicy(""), "off");
  assert.equal(normalizePoolPolicy("OFF"), "off");
  assert.equal(normalizePoolPolicy("auto"), "auto");
  assert.equal(normalizePoolPolicy("multi"), "multi");
  assert.equal(normalizePoolPolicy("MULTI"), "multi");
  assert.equal(normalizePoolPolicy("everything"), "off");
  assert.equal(normalizePoolPolicy(7), "off");
});

check("off keeps the current behaviour: billed engines are filtered out", () => {
  const pool = normalizeLanguagePool(["openai", "bing"], DEFAULT_ZH_POOL, "off");
  assert.deepEqual(pool, ["bing"]);
  const allBilled = normalizeLanguagePool(["openai", "gemini"], DEFAULT_ZH_POOL, "off");
  assert.deepEqual(allBilled, DEFAULT_ZH_POOL, "a billed-only pool falls back to the default");
});

check("auto lets every billed engine into the pool", () => {
  const pool = normalizeLanguagePool(["openai", "bing"], DEFAULT_ZH_POOL, "auto");
  assert.deepEqual(pool, ["openai", "bing"]);
  const all = normalizeLanguagePool(BILLED, DEFAULT_ZH_POOL, "auto");
  assert.deepEqual(all, BILLED);
});

check("multi behaves like auto for the pool contents", () => {
  const pool = normalizeLanguagePool(["metaso", "exa"], DEFAULT_EN_POOL, "multi");
  assert.deepEqual(pool, ["metaso", "exa"]);
});

check("auto routing can put a billed engine first when the user does", () => {
  const routed = routeEngines("deepseek harness", {
    zhPool: ["openai", "bing"],
    enPool: ["openai", "bing"],
    poolPolicy: "auto",
  });
  assert.equal(routed[0], "openai", `expected openai first, got ${routed.slice(0, 4).join(",")}`);
  assert.equal(routed.includes("bing"), true);
});

check("off routing still excludes a billed engine that was written into the pool", () => {
  const routed = routeEngines("deepseek harness", {
    zhPool: ["openai", "bing"],
    enPool: ["openai", "bing"],
    poolPolicy: "off",
  });
  assert.equal(routed.includes("openai"), false);
});

check("the policy changes the cache key", () => {
  const base = ["query", 5, "", "auto", [], [], [], 0, 1];
  const withOff = buildCacheKey(...base, ["openai", "bing"], ["bing"], "off");
  const withAuto = buildCacheKey(...base, ["openai", "bing"], ["bing"], "auto");
  assert.notEqual(withOff, withAuto, "switching the policy must invalidate cached results");
  const sameAgain = buildCacheKey(...base, ["openai", "bing"], ["bing"], "auto");
  assert.equal(withAuto, sameAgain);
});

check("the default pools never contain a billed engine", () => {
  for (const id of BILLED) {
    assert.equal(ALL_ENGINES.includes(id), true, `${id} must exist`);
  }
  const zh = normalizeLanguagePool([], DEFAULT_ZH_POOL, "auto");
  assert.deepEqual(zh, DEFAULT_ZH_POOL);
});

console.log(`OK: ${checks} pool policy checks passed`);
