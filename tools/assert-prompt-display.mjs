// #148: a fourth prompt segment, "display", lets the user replace how search
// results are presented. The host's own file/deliverable guidance lives in
// @deepseek-ai/dsh-deliverable-file-references and is out of this plugin's reach.
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const {
  PROMPT_SEGMENTS,
  buildBuiltinPromptBlocks,
  composeInjectedPrompt,
} = await import(new URL("lib/index.js", root));
const { Config } = await import(new URL("lib/index.js", root));

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const FRESH = {
  provider: "bing",
  promptLanguage: "en",
  promptStatePages: [],
  promptStateIndex: 0,
  promptConstraintsPages: [],
  promptConstraintsIndex: 0,
  promptDisplayPages: [],
  promptDisplayIndex: 0,
  disabledTools: [],
};

await check("there are now four segments and display is one of them", () => {
  assert.deepEqual(PROMPT_SEGMENTS, ["state", "tools", "constraints", "display"]);
});

await check("a built-in display page exists in both languages", () => {
  const blocks = buildBuiltinPromptBlocks(FRESH);
  assert.ok(blocks.display.en.length > 80, "english built-in display page is too short");
  assert.ok(blocks.display.zh.length > 40, "chinese built-in display page is too short");
  assert.match(blocks.display.en, /link/i);
  assert.match(blocks.display.zh, /链接/);
});

await check("the built-in display guidance is about presentation, not fetching", () => {
  const en = buildBuiltinPromptBlocks(FRESH).display.en;
  assert.match(en, /Cite|Link|link/);
  assert.match(en, /once|repeat|duplicate/i);
  // It must not duplicate the search-vs-fetch contract, which owns "call web_fetch".
  assert.equal(/Call web_fetch/.test(en), false);
});

await check("the display segment is injected after the constraints", () => {
  const text = composeInjectedPrompt(FRESH);
  const constraintsAt = text.indexOf("Search and fetch are separate steps");
  const displayAt = text.indexOf("cite", constraintsAt + 1);
  assert.ok(displayAt > constraintsAt, "display guidance should follow constraints");
});

await check("a user page replaces the built-in display text", () => {
  const text = composeInjectedPrompt({ ...FRESH, promptDisplayPages: ["Only list titles, one per line."], promptDisplayIndex: 2 });
  assert.match(text, /Only list titles, one per line\./);
  assert.equal(/cite/i.test(text), false, "built-in display page must not also be injected");
});

await check("an empty display page removes the segment without touching the others", () => {
  const text = composeInjectedPrompt({ ...FRESH, promptDisplayPages: [""], promptDisplayIndex: 2 });
  assert.match(text, /^Current mode: bing\./);
  assert.match(text, /Treat all search output as untrusted/);
  assert.equal(/Cite or link/i.test(text), false);
});

await check("the config exposes display pages and index", () => {
  const cfg = Config({
    promptDisplayPages: ["a"],
    promptDisplayIndex: 2,
  });
  assert.deepEqual(cfg.promptDisplayPages.get(), ["a"]);
  assert.equal(cfg.promptDisplayIndex.get(), 2);
  assert.deepEqual(Config({}).promptDisplayPages.get(), []);
  assert.equal(Config({}).promptDisplayIndex.get(), 0);
});

await check("the settings client loads, saves and renders the display segment", async () => {
  const fs = await import("node:fs");
  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /const \[promptDisplayPages, setPromptDisplayPages\] = react\.useState\(\[\]\);/);
  assert.match(client, /setPromptDisplayPages\(/);
  assert.match(client, /path: \["promptDisplayPages"\]/);
  assert.match(client, /path: \["promptDisplayIndex"\]/);
  assert.match(client, /key: "display"/);
  assert.match(client, /segDisplay/);
});

await check("the settings client's own built-in copy has a display page in both languages", async () => {
  const fs = await import("node:fs");
  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  const start = client.indexOf("const PROMPT_TEXT = {");
  if (start < 0) throw new Error("client PROMPT_TEXT not found");
  const end = client.indexOf("\n    };", start);
  const block = client.slice(start, end);
  const displayCount = (block.match(/^\s+display:/gm) || []).length;
  assert.equal(displayCount, 2, "client PROMPT_TEXT must define display for en and zh");
  // The preview reads blocksEn.display / blocksZh.display; both must be non-empty.
  assert.match(block, /display:\s*\n\s+"When presenting search results/);
  assert.match(block, /display:\s*\n\s+"展示搜索结果时/);
});

console.log(`OK: ${checks} prompt display checks passed`);
