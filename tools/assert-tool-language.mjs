// 「提示词语言」下拉已删除：工具侧文字的语言改由 toolLanguageOf 决定。
//
// 规则（服务端 lib/prompt_i18n.js 与客户端 lib/client.js 必须一致）：
//   显式 promptToolsLang > 界面语言（uiLang，跟随应用时用宿主 locale）> en
//
// 这条断言钉住三件事：
//   1. 服务端不再读 promptLanguage 定工具语言
//   2. 客户端预览用同一套规则（否则界面显示 ≠ 实际注入）
//   3. 界面不再有那个下拉，但字段仍可读（旧配置不会报错）
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const pi = fs.readFileSync(new URL("lib/prompt_i18n.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

check("toolLanguageOf 是唯一的语言来源", () => {
  assert.match(pi, /export function toolLanguageOf\(cfg\) \{/);
  // 优先级：显式 promptToolsLang > uiLang > en
  const fn = pi.slice(pi.indexOf("export function toolLanguageOf"), pi.indexOf("export function localizedEffect"));
  assert.match(fn, /cfg\?\.promptToolsLang/, "explicit promptToolsLang wins");
  assert.match(fn, /cfg\?\.uiLang/, "uiLang is the fallback");
  assert.match(fn, /return "en";/, "defaults to en");
});

check("所有工具注册都改用 toolLanguageOf", () => {
  const n = (index.match(/getLang: \(\) => toolLanguageOf\(current\(\)\)/g) ?? []).length;
  assert.equal(n, 6, `expected 6 tool registrations, found ${n}`);
  assert.equal((index.match(/getLang: \(\) => promptLanguageOf\(\current\(\)\)/g) ?? []).length, 0);
});

check("工具段摘要与运行时文案同源", () => {
  assert.match(index, /const toolsLang = toolLanguageOf\(cfg\);/);
  assert.match(index, /const noteLang = [^;]*toolLanguageOf\(/);
});

check("客户端预览与服务端同一规则", () => {
  const block = client.slice(client.indexOf("const uiLangNow = resolveUiLocale(uiLang, hostLanguage);"), client.indexOf("const promptSegments = ["));
  assert.match(block, /const toolsLang = promptToolsLang === "zh" \|\| promptToolsLang === "en"/);
  assert.ok(
    block.includes('localeId(uiLangNow) === "zh" ? "zh" : "en")'),
    "falls back to the visible UI language",
  );
});

check("界面上没有那个下拉了", () => {
  assert.equal((client.match(/t\.promptLangLabel/g) ?? []).length, 0, "the picker is gone");
  assert.equal((client.match(/t\.promptLangHint/g) ?? []).length, 0, "its hint is gone");
  // 但字段还在（旧配置不报错），也不再被写死
  assert.match(index, /promptLanguage: z\.string\(\)\.default\("en"\)\.volatile\(\)/);
  assert.equal((client.match(/op: "set", path: \["promptLanguage"\]/g) ?? []).length, 0, "client no longer overwrites it");
});

console.log(`OK: ${checks} tool-language checks passed`);
