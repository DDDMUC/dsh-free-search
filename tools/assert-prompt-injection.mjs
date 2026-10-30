// #102: the injected prompt is paged. Page 1 is the built-in English page, page 2 the
// built-in Chinese page, page 3+ are pages the user wrote. The page you are on is what
// gets injected; an empty page injects nothing.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const {
  PROMPT_BUILTIN_LANGS,
  normalizePromptPages,
  promptPageCount,
  normalizePromptPageIndex,
  promptPageKind,
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

check("two built-in pages come first, the user's pages follow", () => {
  assert.deepEqual(PROMPT_BUILTIN_LANGS, ["en", "zh"]);
  assert.equal(promptPageCount([]), 2);
  assert.equal(promptPageCount(["a", "b"]), 4);
  assert.deepEqual(normalizePromptPages(["a", 2, null]), ["a", "2", ""]);
  assert.deepEqual(normalizePromptPages("nope"), []);
});

check("page kinds and texts line up", () => {
  const builtins = { en: "EN", zh: "ZH" };
  assert.deepEqual([0, 1, 2, 3].map((i) => promptPageKind(i, ["u1", "u2"])), [
    "builtin-en",
    "builtin-zh",
    "user",
    "user",
  ]);
  assert.deepEqual([0, 1, 2, 3].map((i) => promptPageText(["u1", "u2"], i, builtins)), ["EN", "ZH", "u1", "u2"]);
  assert.equal(normalizePromptPageIndex(9, 4), 3);
  assert.equal(normalizePromptPageIndex(-3, 4), 0);
  assert.equal(normalizePromptPageIndex("x", 4), 0);
});

check("the page you are on is what gets injected", () => {
  const builtins = { en: "EN", zh: "ZH" };
  assert.equal(effectivePromptText({ builtins, pages: ["mine"], index: 0 }), "EN");
  assert.equal(effectivePromptText({ builtins, pages: ["mine"], index: 1 }), "ZH");
  assert.equal(effectivePromptText({ builtins, pages: ["mine"], index: 2 }), "mine");
});

check("an empty page injects nothing", () => {
  assert.equal(effectivePromptText({ builtins: { en: "EN", zh: "ZH" }, pages: [""], index: 2 }), "");
  assert.equal(effectivePromptText({ builtins: { en: "EN", zh: "ZH" }, pages: ["   "], index: 2 }), "");
  assert.match(index, /if \(!injected\) return;/);
});

check("the generated page is three blocks and follows the config", () => {
  const en = buildBuiltinPromptText({ provider: "bing", promptLanguage: "en", disabledEngines: ["baidu"] }, "en");
  const zh = buildBuiltinPromptText({ provider: "bing", promptLanguage: "zh" }, "zh");
  assert.match(en, /^## Web search \(free-search\)/);
  assert.match(en, /### State/);
  assert.match(en, /### Tools/);
  assert.match(en, /### Constraints/);
  assert.equal(en.includes("baidu"), false);
  assert.match(zh, /^## 网页搜索（free-search）/);
  assert.match(zh, /### 状态/);
  assert.match(zh, /### 工具/);
  assert.match(zh, /### 约束/);
});

check("promptMode is gone everywhere", () => {
  for (const [name, source] of [["index", index], ["client", client]]) {
    assert.equal(source.includes("promptMode"), false, `${name} still mentions promptMode`);
  }
  assert.equal(client.includes("PROMPT_MODES"), false);
});

check("the panel renders the built-in pages from the describe payload, with no extra request", () => {
  assert.match(index, /promptBuiltin: \{ en: buildBuiltinPromptText\(cfg, "en"\), zh: buildBuiltinPromptText\(cfg, "zh"\) \},/);
  assert.equal(index.includes("/prompt-preview"), false);
  assert.equal(client.includes("bridgePromptPreview"), false);
  assert.match(client, /const \[builtinPrompts, setBuiltinPrompts\] = react\.useState\(\{ en: "", zh: "" \}\);/);
  assert.match(client, /const builtin = result\.value\.promptBuiltin;/);
  assert.match(client, /setBuiltinPrompts\(\{ en: String\(builtin\.en \?\? ""\), zh: String\(builtin\.zh \?\? ""\) \}\);/);
});

check("the seventh section has a plain pager and its own anchor", () => {
  assert.match(client, /\{ id: "prompt", anchor: "dshfs-anchor-prompt" \},/);
  assert.match(client, /id: "dshfs-anchor-prompt",/);
  assert.match(client, /"data-dsh-section": "prompt",/);
  assert.match(client, /children: `\$\{promptPageIndex \+ 1\} \/ \$\{promptPageTotal\}` \}/);
  assert.match(client, /children: "\+" \}, "add"\)/);
  assert.match(client, /children: "−" \}, "remove"\)/);
  assert.equal(client.includes("promptPageName"), false);
  assert.equal(client.includes("promptCopyPage"), false);
  assert.match(client, /const promptPageTotal = PROMPT_BUILTIN_PAGES \+ promptPages\.length;/);
  assert.match(client, /readOnly: promptPageKind\(promptPageIndex\) !== "user",/);
});

check("tool switches are normalised and wired into every registrar", () => {
  assert.deepEqual(normalizeDisabledTools([" domain_search ", "domain_search", "", null]), ["domain_search"]);
  assert.deepEqual(normalizeDisabledTools("nope"), []);
  assert.equal((index.match(/getEnabled: \(\) => toolEnabled\("/g) || []).length, 6);
  const research = fs.readFileSync(new URL("lib/research.js", root), "utf8");
  const vertical = fs.readFileSync(new URL("lib/vertical.js", root), "utf8");
  assert.match(vertical, /getEnabled: \(\) => !isToolDisabled\("domain_search"\)/);
  assert.match(research, /getEnabled: \(\) => !\(isToolDisabled\("research"\) && isToolDisabled\("cache_search"\)\)/);
  assert.match(client, /const TOOL_TOGGLES = \[/);
  assert.match(client, /"domain_search",/);
});

check("config keeps only the fields the panel needs", () => {
  assert.match(index, /promptPages: z\.array\(z\.string\(\)\)\.default\(\[\]\)\.volatile\(\)/);
  assert.match(index, /promptPageIndex: z\.number\(\)\.default\(0\)\.volatile\(\)/);
  assert.match(index, /disabledTools: z\.array\(z\.string\(\)\)\.default\(\[\]\)\.volatile\(\)/);
  assert.match(index, /promptLanguage: z\.string\(\)\.default\("en"\)\.volatile\(\)/);
});

console.log(`OK: ${checks} prompt-injection checks passed`);