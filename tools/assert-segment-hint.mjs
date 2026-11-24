// 三段分页编辑器的说明"第 1 页和第 2 页无法编辑和删除"应该挂在三个段标题上，
// 而不是单独一条 p 悬在它们上方（那样读起来像只在说第一段）。
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

check("这句话挂在三个分段的标题上（悬停卡片）", () => {
  // 三段共用同一个 renderPromptSegment：标题处出现一次 HintCard
  const seg = client.slice(client.indexOf("const renderPromptSegment"), client.indexOf("const title = panelLabel"));
  assert.match(seg, /react_jsx_runtime\.jsx\(HintCard, \{ text: t\.promptHint, children: segment\.title \}\)/, "segment title must use the hint card");
});

check("不再有悬在三段上方的独立段落", () => {
  assert.equal(
    client.includes('className: "dshfs-hint", children: t.promptHint'),
    false,
    "the standalone paragraph must be gone",
  );
  const anchor = client.indexOf('id: "dshfs-anchor-prompt"');
  const block = client.slice(anchor, anchor + 400);
  assert.equal(/t\.promptHint/.test(block), false, "the prompt field must not lead with this paragraph");
});

check("工具段没有这句话（它没有内置页）", () => {
  const tools = client.slice(client.indexOf("const renderToolsSegment"), client.indexOf("const renderPromptSegment"));
  assert.equal(/promptHint/.test(tools), false, "the tools segment has no built-in pages, so no such note");
});

check("文案本身没变", () => {
  assert.match(client, /promptHint: "第 1 页和第 2 页无法编辑和删除，其余页可自由编辑。"/);
  assert.match(client, /promptHint: "Pages 1 and 2 cannot be edited or deleted; the rest are yours to edit."/);
});

console.log(`OK: ${checks} segment hint checks passed`);
