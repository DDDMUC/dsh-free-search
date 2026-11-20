// The prompt must not claim billed engines are "explicit only" once the user
// let them into a pool, and Multi's listed pool must match what actually runs.
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const { buildBuiltinPromptBlocks } = await import(new URL("lib/index.js", root));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

// The billed engine must be enabled (allowlisted) for the prompt to mention it.
const blocks = (cfg) =>
  buildBuiltinPromptBlocks({
    provider: "auto",
    allowedEngines: ["openai", "bing"],
    zhPool: ["openai", "bing"],
    enPool: ["bing"],
    ...cfg,
  });

// Line 2 of the state block is the pool description for Multi.
const multiPoolLine = (state) => String(state).split("\n")[1] ?? "";

check("off keeps the explicit-only sentence", () => {
  const state = blocks({ poolPolicy: "off" }).state.en;
  assert.match(state, /run only when explicitly selected/);
});

check("auto rewrites the sentence instead of contradicting itself", () => {
  const state = blocks({ poolPolicy: "auto" }).state.en;
  assert.equal(/run only when explicitly selected/.test(state), false, "old sentence must be gone");
  assert.match(state, /allowed into the language pools/);
  assert.match(state, /at most one per search, one charge/);
});

check("multi widens the wording to concurrent charges", () => {
  const state = blocks({ poolPolicy: "multi" }).state.en;
  assert.match(state, /one charge per engine per search/);
});

check("multi runs the billed engine only under the multi policy", () => {
  const withMulti = buildBuiltinPromptBlocks({
    provider: "multi",
    poolPolicy: "multi",
    allowedEngines: ["openai", "bing"],
    zhPool: ["openai", "bing"],
    enPool: ["bing"],
  }).state.en;
  assert.match(multiPoolLine(withMulti), /openai/);

  const withAuto = buildBuiltinPromptBlocks({
    provider: "multi",
    poolPolicy: "auto",
    allowedEngines: ["openai", "bing"],
    zhPool: ["openai", "bing"],
    enPool: ["bing"],
  }).state.en;
  assert.equal(/openai/.test(multiPoolLine(withAuto)), false, "auto policy must not leak into Multi's pool");
});

check("the Chinese copy tracks the same switch", () => {
  const state = blocks({ poolPolicy: "auto" }).state.zh;
  assert.equal(/仅在显式指定时调用/.test(state), false);
  assert.match(state, /放行进语言池/);
});

console.log(`OK: ${checks} pool prompt checks passed`);
