// #109: the multi_search result ceiling is configurable; the per-call
// maxResults can ask for fewer but never more than that ceiling.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const { Config, multiResultLimit, normalizeMultiMaxResults, MULTI_RESULTS_MAX, buildBuiltinPromptBlocks } = await import(
  new URL("lib/index.js", root)
);
const { toolParam } = await import(new URL("lib/prompt_i18n.js", root));
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("the default ceiling stays at 20 and the hard maximum is 100", () => {
  assert.equal(MULTI_RESULTS_MAX, 100);
  assert.equal(normalizeMultiMaxResults(undefined), 20);
  assert.equal(normalizeMultiMaxResults(0), 20);
  assert.equal(normalizeMultiMaxResults(-5), 20);
  assert.equal(normalizeMultiMaxResults(30), 30);
  assert.equal(normalizeMultiMaxResults(500), 100);
  assert.equal(Config({}).multiMaxResults.get(), 20);
  assert.equal(Config({ multiMaxResults: 40 }).multiMaxResults.get(), 40);
});

check("a per-call request is clamped to the configured ceiling", () => {
  assert.equal(multiResultLimit(undefined, 20), 8);
  assert.equal(multiResultLimit(5, 20), 5);
  assert.equal(multiResultLimit(40, 20), 20);
  assert.equal(multiResultLimit(40, 30), 30);
  assert.equal(multiResultLimit(40, 100), 40);
  assert.equal(multiResultLimit(0, 20), 8);
  assert.equal(multiResultLimit(-3, 20), 8);
  assert.equal(multiResultLimit(12, 0), 12);
});

check("the model-facing parameter copy names the effective ceiling", () => {
  assert.match(toolParam("en", "multi_search", "maxResults", { limit: 35 }), /up to 35/);
  assert.match(toolParam("zh", "multi_search", "maxResults", { limit: 35 }), /最多 35/);
  assert.match(toolParam("en", "multi_search", "maxResults", { limit: 35 }), /hard max 100/);
});

check("the built-in prompt states the configured ceiling", () => {
  const blocks = buildBuiltinPromptBlocks({ provider: "multi", multiMaxResults: 35 });
  assert.match(blocks.state.en, /result ceiling is 35/);
  assert.match(blocks.state.zh, /上限为 35/);
});

check("the server uses the helper and exposes the setting", () => {
  assert.match(index, /const limit = multiResultLimit\(maxResults, current\(\)\.multiMaxResults\);/);
  assert.match(index, /multiMaxResults: z\.number\(\)\.default\(20\)\.volatile\(\)/);
  // The ceiling used to be pinned here as `maximum: MULTI_RESULTS_MAX` on the
  // maxResults schema. The host's value schema DSL refuses `minimum`/`maximum`
  // on a scalar node and then declines to register the whole tool, so the bound
  // moved into multiResultLimit() and the range is stated in the description.
  // Assert that split instead of the removed keyword.
  assert.doesNotMatch(index, /\bmaximum:\s*MULTI_RESULTS_MAX/);
  assert.match(index, /limit: normalizeMultiMaxResults\(current\(\)\.multiMaxResults\)/);
});

check("the settings UI edits and saves the ceiling", () => {
  assert.match(client, /path: \["multiMaxResults"\]/);
  assert.match(client, /children: t\.multiMaxResults/);
  assert.match(client, /limit: multiResultCeiling\(cfg\.multiMaxResults\)/);
});

console.log(`OK: ${checks} multi-limit checks passed`);
