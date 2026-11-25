// 运行时输出面板：显示的东西必须来自 lib/ 源码，而不是手抄的近似版本。
//
// 这条断言的核心是「不是自证」：左边是从源码抽取的（tools/lib/extract-runtime-copy.mjs），
// 右边是 client.js 里的内联副本。两边必须完全相同 —— 没有一个 `||` 能让它放过。
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractRuntimeCopy } from "./lib/extract-runtime-copy.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientPath = path.join(root, "lib", "client.js");
const client = fs.readFileSync(clientPath, "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

// 内联副本：从 client.js 里取那个对象字面量，按 JS 求值（末尾有逗号，JSON.parse 收不了）。
const at = client.indexOf("const RUNTIME_OUTPUT_COPY = ");
assert.ok(at > 0, "RUNTIME_OUTPUT_COPY missing");
const open = client.indexOf("{", at);
let depth = 0;
let end = -1;
for (let i = open; i < client.length; i += 1) {
  if (client[i] === "{") depth += 1;
  else if (client[i] === "}") {
    depth -= 1;
    if (depth === 0) { end = i + 1; break; }
  }
}
assert.ok(end > open, "RUNTIME_OUTPUT_COPY object is not closed");
const inline = new Function(`return (${client.slice(open, end)});`)();

const source = extractRuntimeCopy(root);

check("置信度说明与源码逐字一致（双向）", () => {
  assert.deepEqual(Object.keys(inline.notes), Object.keys(source.notes), "键集合");
  for (const k of Object.keys(source.notes)) {
    assert.equal(inline.notes[k].zh, source.notes[k].zh, `${k}.zh`);
    assert.equal(inline.notes[k].en, source.notes[k].en, `${k}.en`);
  }
});

check("回退 Note 模板与源码逐字一致", () => {
  assert.deepEqual(inline.noteTemplates, source.noteTemplates);
});

check("输出外壳与源码逐字一致（含工具名）", () => {
  // 起点必须是真实模板，而不是凭记忆写的 ${provider}
  for (const entry of source.shells) {
    assert.ok(
      entry.text.includes("value.") || !entry.text.includes("${"),
      `外壳里出现了没加 value. 的变量：${entry.text}`,
    );
  }
  assert.deepEqual(inline.shells, source.shells);
  // 所有会带输出的工具都在里面（含 weather 的三种语言表头）
  const tools = new Set(source.shells.map((s) => s.tool));
  for (const t of ["free_search_test", "platform_search", "video_search", "advanced_search", "multi_search", "research", "domain_search", "weather"]) {
    assert.ok(tools.has(t), `${t} 的输出外壳缺失`);
  }
});

check("空结果占位与边界标记来自源码", () => {
  assert.deepEqual(inline.placeholders, source.placeholders);
  assert.deepEqual(inline.boundary, source.boundary);
  // 边界标记必须是源码里真实用到的常量
  const index = fs.readFileSync(path.join(root, "lib", "index.js"), "utf8");
  assert.ok(index.includes(`"<untrusted-web-content>"`) || index.includes("<untrusted-web-content>"));
});

check("Confidence / 空结果占位不在外壳里（分组不能混）", () => {
  for (const entry of inline.shells) {
    assert.equal(entry.text.startsWith("Confidence:"), false, `Confidence 被错放进外壳：${entry.text}`);
    assert.equal(entry.text.startsWith("No "), false, `空结果占位被错放进外壳：${entry.text}`);
  }
});

check("四类文字各自成段，不是一个块", () => {
  // 旧实现把它们塞进一个 dshfs-segment，用 runtimeGroup 分小组。
  assert.equal(/dshfs-runtimeGroup/.test(client), false, "分组标题组件应已移除");
  for (const fn of [
    "renderConfidenceSegment",
    "renderFallbackSegment",
    "renderShellSegment",
    "renderPlaceholderSegment",
  ]) {
    assert.match(client, new RegExp(`const ${fn} = \\(\\) =>`), `${fn} 未定义`);
    assert.match(client, new RegExp(`${fn}\\(\\),`), `${fn} 未挂到页面`);
  }
});

check("只有置信度说明带语言切换", () => {
  // 回退 Note、输出外壳、空结果占位都是固定英文，不该出现中/EN 按钮。
  const block = client.slice(
    client.indexOf("const renderConfidenceSegment = () =>"),
    client.indexOf("const renderToolsSegment = () =>"),
  );
  const conf = block.slice(0, block.indexOf("const renderFallbackSegment"));
  assert.match(conf, /runtimeLangButtons\(\)/, "置信度段要带切换");
  const rest = block.slice(block.indexOf("const renderFallbackSegment"));
  assert.equal(/runtimeLangButtons\(\)/.test(rest), false, "固定英文的段不该带切换");
});

check("说明文字不写位置错的话", () => {
  // 回退 Note 在结果列表之后、不可信标签之内 —— 早先写成「工具输出开头」是错的。
  assert.equal(/工具输出开头/.test(client), false, "回退 Note 的位置描述是错的");
  assert.match(client, /结果列表之后/);
  assert.match(client, /untrusted-web-content/);
});

check("这一段不进入注入", () => {
  // 运行时文案只出现在工具返回值里；注入的提示词产物不该包含它们。
  assert.equal(
    /composeInjectedPrompt[\s\S]{0,4000}Note: \$\{preferred\}/.test(
      fs.readFileSync(path.join(root, "lib", "index.js"), "utf8"),
    ),
    false,
    "回退 Note 不能出现在注入的提示词里",
  );
});

console.log(`OK: ${checks} runtime-copy checks passed`);
