// #102: paged, switchable prompt injection + per-tool switches.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const {
  PROMPT_MODES,
  normalizePromptMode,
  normalizePromptPages,
  normalizePromptPageIndex,
  promptPageCount,
  promptPageText,
  effectivePromptText,
} = await import(new URL("lib/prompt_i18n.js", root));
const { normalizeDisabledTools, buildBuiltinPromptText } = await import(new URL("lib/index.js", root));

const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("mode and page inputs are normalised", () => {
  assert.deepEqual(PROMPT_MODES, ["builtin", "append", "replace"]);
  assert.equal(normalizePromptMode(" APPEND "), "append");
  assert.equal(normalizePromptMode("nonsense"), "builtin");
  assert.equal(normalizePromptMode(undefined), "builtin");
  assert.deepEqual(normalizePromptPages(["a", 2, null]), ["a", "2", ""]);
  assert.deepEqual(normalizePromptPages("nope"), []);
});

check("page index clamps to the available pages", () => {
  assert.equal(promptPageCount([]), 1);
  assert.equal(promptPageCount(["a", "b"]), 3);
  assert.equal(normalizePromptPageIndex(9, 3), 2);
  assert.equal(normalizePromptPageIndex(-4, 3), 0);
  assert.equal(normalizePromptPageIndex("x", 3), 0);
});

check("page 0 is the built-in page, later pages are the user's", () => {
  assert.equal(promptPageText(["u1", "u2"], 0, "BUILTIN"), "BUILTIN");
  assert.equal(promptPageText(["u1", "u2"], 1, "BUILTIN"), "u1");
  assert.equal(promptPageText(["u1", "u2"], 2, "BUILTIN"), "u2");
});

check("builtin / append / replace compose the effective text", () => {
  const base = { builtin: "B", pages: ["U"], index: 1 };
  assert.equal(effectivePromptText({ ...base, mode: "builtin" }), "B");
  assert.equal(effectivePromptText({ ...base, mode: "append" }), "B\n\nU");
  assert.equal(effectivePromptText({ ...base, mode: "replace" }), "U");
  assert.equal(effectivePromptText({ mode: "append", builtin: "B", pages: [""], index: 1 }), "B");
  assert.equal(effectivePromptText({ mode: "append", builtin: "", pages: ["U"], index: 1 }), "U");
});

check("an empty effective page means: inject nothing", () => {
  assert.equal(effectivePromptText({ mode: "replace", builtin: "B", pages: ["   "], index: 1 }), "");
  // Page 0 is the built-in page, so "replace" without any custom page still yields the
  // built-in text; turning the section off means parking on an empty custom page.
  assert.equal(effectivePromptText({ mode: "replace", builtin: "B", pages: [], index: 0 }), "B");
});

check("the built-in page is generated from the live config", () => {
  const text = buildBuiltinPromptText({
    provider: "bing",
    disabledEngines: ["baidu"],
    safeSearch: "off",
    bingMarket: "zh-CN",
    promptLanguage: "en",
  });
  assert.match(text, /^## Web search \(free-search\)/);
  assert.match(text, /Search and fetch are separate steps/);
  assert.equal(text.includes("baidu"), false, "disabled engine must not be listed");
  const zh = buildBuiltinPromptText({ provider: "bing", promptLanguage: "zh" });
  assert.match(zh, /^## 网页搜索（free-search）/);
});

check("tool switches are normalised and wired into every registrar", () => {
  assert.deepEqual(normalizeDisabledTools([" domain_search ", "domain_search", "", null]), ["domain_search"]);
  assert.deepEqual(normalizeDisabledTools("nope"), []);
  assert.equal((index.match(/getEnabled: \(\) => toolEnabled\("/g) || []).length, 6);
  const research = fs.readFileSync(new URL("lib/research.js", root), "utf8");
  const vertical = fs.readFileSync(new URL("lib/vertical.js", root), "utf8");
  assert.match(vertical, /getEnabled: \(\) => !isToolDisabled\("domain_search"\)/);
  assert.match(research, /getEnabled: \(\) => !\(isToolDisabled\("research"\) && isToolDisabled\("cache_search"\)\)/);
  assert.match(research, /isToolDisabled\("research"\) \? undefined : sctx\.tools\.register/);
  assert.match(research, /isToolDisabled\("cache_search"\) \? undefined : sctx\.tools\.register/);
  assert.match(index, /isToolDisabled: \(id\) => !toolEnabled\(id\)/);
});

check("the section is skipped when the effective text is empty", () => {
  assert.match(index, /const injected = effectivePromptText\(\{/);
  assert.match(index, /if \(!injected\) return;/);
  assert.match(index, /sctx\.systemPrompt\.section\(\{ name: "free-search:engines", order: 500, text: injected \}\)/);
});

check("config exposes the four new fields", () => {
  assert.match(index, /promptMode: z\.string\(\)\.default\("builtin"\)\.volatile\(\)/);
  assert.match(index, /promptPages: z\.array\(z\.string\(\)\)\.default\(\[\]\)\.volatile\(\)/);
  assert.match(index, /promptPageIndex: z\.number\(\)\.default\(0\)\.volatile\(\)/);
  assert.match(index, /disabledTools: z\.array\(z\.string\(\)\)\.default\(\[\]\)\.volatile\(\)/);
});

check("the preview bridge route exists and the client uses it", () => {
  assert.match(index, /path: `\$\{BRIDGE_PREFIX\}\/prompt-preview`/);
  assert.match(index, /async promptPreview\(request\)/);
  assert.match(client, /async function bridgePromptPreview\(payload\)/);
  assert.match(client, /bridgePromptPreview\(\{ mode: promptMode, pages: promptPages, index: promptPageIndex \}\)/);
});

check("the client renders the seventh section with its anchor", () => {
  assert.match(client, /\{ id: "prompt", anchor: "dshfs-anchor-prompt" \},/);
  assert.match(client, /id: "dshfs-anchor-prompt",/);
  assert.match(client, /prompt: t\.navPrompt,/);
  assert.match(client, /const TOOL_TOGGLES = \[/);
  assert.match(client, /"free_search_test",/);
  assert.match(client, /"domain_search",/);
});

console.log(`OK: ${checks} prompt-injection checks passed`);