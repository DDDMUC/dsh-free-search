// #94: tool descriptions share one engine-id list and stay inside a character budget.
// Guards against re-embedding per-engine sentences into the schema (every request pays for them).
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const idx = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const vert = fs.readFileSync(new URL("lib/vertical.js", root), "utf8");
const { ALL_ENGINES } = await import(new URL("lib/index.js", root));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("index.js exposes a single shared engine-id list", () => {
  assert.match(idx, /const ENGINE_IDS_PROMPT = ALL_ENGINES\.join\(", "\);/);
});

check("free_search_test and advanced_search reuse it instead of inline lists", () => {
  assert.equal((idx.match(/\$\{ENGINE_IDS_PROMPT\}/g) || []).length, 2);
  assert.equal(idx.includes("Options: ddg, ddg-lite"), false);
  assert.equal(idx.includes("multi (parallel full language-pool merge), auto, ddg"), false);
});

check("domain_search no longer embeds one sentence per vertical engine", () => {
  assert.equal(vert.includes("`${k} (${e.desc})`"), false);
  const at = vert.indexOf("Direct lookup in a vertical source");
  const block = vert.slice(at, vert.indexOf("parameters:", at));
  const text = [...block.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
  assert.ok(text.length < 700, `domain_search description is ${text.length} chars`);
});

check("the three schemas stay under 1.6k chars (~400 tokens)", () => {
  const test = `Which engines to test (default: all enabled). ${ALL_ENGINES.join(", ")}; auto/multi run the virtual routing path. zhihu_* need ZHIHU_API_KEY; openai/gemini/claude bill per search.`;
  const adv = `Optional search mode/engine: multi (parallel language-pool merge), auto, or one of ${ALL_ENGINES.join(", ")}. openai/gemini/claude are model-based and explicit-only.`;
  const at = vert.indexOf("Direct lookup in a vertical source");
  const block = vert.slice(at, vert.indexOf("parameters:", at));
  const dom = [...block.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
  const total = test.length + adv.length + dom.length;
  assert.ok(total < 1600, `total ${total} chars`);
});

check("per-engine sentences are still available in the registries", () => {
  assert.match(vert, /desc:/);
  assert.match(idx, /label:/);
});

console.log(`OK: ${checks} schema-size checks passed`);
