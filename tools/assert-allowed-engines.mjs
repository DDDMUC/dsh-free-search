// #106: an allowedEngines whitelist narrows the engine set without teaching
// every downstream consumer about it.
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const {
  ALL_ENGINES,
  Config,
  buildBuiltinPromptBlocks,
  effectiveDisabledEngines,
  enabledEngines,
  normalizeAllowedEngines,
  routeEngines,
} = await import(new URL("lib/index.js", root));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("allowed entries are normalised like the disabled ones", () => {
  assert.deepEqual(normalizeAllowedEngines(["exa", "exa", "nope", 7, null]), ["exa"]);
  assert.deepEqual(normalizeAllowedEngines(undefined), []);
  assert.deepEqual(normalizeAllowedEngines("exa"), []);
});

check("an empty whitelist keeps the old disabled list exactly", () => {
  assert.deepEqual(effectiveDisabledEngines({}), []);
  assert.deepEqual(effectiveDisabledEngines({ disabledEngines: ["ddg"] }), ["ddg"]);
  assert.deepEqual(effectiveDisabledEngines({ allowedEngines: [] }), []);
});

check("a whitelist disables every other engine, including future ones", () => {
  const disabled = effectiveDisabledEngines({ allowedEngines: ["exa"] });
  assert.equal(disabled.length, ALL_ENGINES.length - 1);
  assert.equal(disabled.includes("exa"), false);
  for (const id of ALL_ENGINES) {
    if (id !== "exa") assert.equal(disabled.includes(id), true, id);
  }
});

check("explicit disables win inside the whitelist", () => {
  const disabled = effectiveDisabledEngines({ allowedEngines: ["exa", "tavily"], disabledEngines: ["tavily"] });
  assert.equal(disabled.includes("exa"), false);
  assert.equal(disabled.includes("tavily"), true);
  assert.equal(disabled.length, ALL_ENGINES.length - 1);
});

check("a typo-only whitelist behaves like no whitelist instead of killing search", () => {
  assert.deepEqual(effectiveDisabledEngines({ allowedEngines: ["exaa"] }), []);
});

check("the enabled order follows the whitelist, including engines outside the default chain", () => {
  const onlyExa = enabledEngines(effectiveDisabledEngines({ allowedEngines: ["exa"] }), [], ["exa"]);
  assert.deepEqual(onlyExa, ["exa"]);
  const serp = enabledEngines(effectiveDisabledEngines({ allowedEngines: ["baidu-html"] }), [], ["baidu-html"]);
  assert.deepEqual(serp, ["baidu-html"]);
  const paid = enabledEngines(effectiveDisabledEngines({ allowedEngines: ["openai"] }), [], ["openai"]);
  assert.deepEqual(paid, ["openai"]);
  const baseline = enabledEngines([], [], []);
  assert.equal(baseline.includes("openai"), false);
});

check("auto routing stays inside the whitelist for normal, SERP and explicit-only engines", () => {
  assert.deepEqual(routeEngines("deepseek harness", { disabledEngines: effectiveDisabledEngines({ allowedEngines: ["exa"] }), allowedEngines: ["exa"] }), ["exa"]);
  assert.deepEqual(routeEngines("鐢靛奖 2026", { disabledEngines: effectiveDisabledEngines({ allowedEngines: ["baidu-html"] }), allowedEngines: ["baidu-html"] }), ["baidu-html"]);
  assert.deepEqual(routeEngines("deepseek harness", { disabledEngines: effectiveDisabledEngines({ allowedEngines: ["openai"] }), allowedEngines: ["openai"] }), ["openai"]);
});

check("the built-in prompt lists only allowed engines and an empty fallback", () => {
  const blocks = buildBuiltinPromptBlocks({ provider: "exa", allowedEngines: ["exa"] });
  const [mode, fallback] = blocks.state.en.split("\n");
  assert.equal(mode, "Current mode: exa. Enabled engines: exa.");
  assert.match(fallback, /fallback uses: none/);
  assert.equal(blocks.state.en.includes("tavily"), false);
  const zh = buildBuiltinPromptBlocks({ provider: "auto", allowedEngines: ["exa"] }).state.zh;
  assert.match(zh, /exa/);
  assert.equal(zh.includes("tavily"), false);
});

check("the schema exposes the whitelist with an empty default", () => {
  assert.deepEqual(Config({}).allowedEngines.get(), []);
  assert.deepEqual(Config({ allowedEngines: ["exa"] }).allowedEngines.get(), ["exa"]);
});

console.log(`OK: ${checks} allowed-engines checks passed`);
