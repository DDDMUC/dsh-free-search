// Long field hints moved into hover cards. The cards must:
//   * be portaled to document.body  - the card has overflow:clip, so an in-tree
//     popup would be cut off at the card edge;
//   * close on Escape and on blur, open on focus (hover alone is not accessible);
//   * cover exactly the four fields converted so far;
//   * leave a touch path, since hover does not exist on phones.
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const CONVERTED = [
  ["blockedDomainsHint", "blockedDomainsLabel", "域名黑名单"],
  ["sidebarEntryHint", "sidebarEntryLabel", "在左侧栏显示入口"],
  ["slashCommandsHint", "slashCommandsLabel", "注册聊天框斜杠命令"],
  ["keylessFirstHint", "keylessFirstLabel", "优先使用免 key 档"],
  // 这六个内联说明很长（表单里每段占 3~5 行），转成悬停卡后表单短了一半。
  ["engineHint", "searchEngine", "搜索引擎（当前引擎 + 说明）"],
  ["engineEnableHint", "engineEnable", "全局启用的搜索引擎"],
  ["fallbackPriorityHint", "fallbackPriority", "全局回退优先级"],
  ["explicitEnginesHint", "explicitEnginesLabel", "仅手动选择"],
  ["billedHint", "billedLabel", "按次计费"],
  ["fallbackOnHint", "fallbackOnLabel", "回退触发条件"],
];

/**
 * 数一个键被引用了几次。
 * 必须按「键名后面不是字母/数字」计：`engineEnable` 是 `engineEnableHint` 的前缀，
 * 简单 includes 会把两者混在一起（实测 HintCard 的 text 恰好也是同一个前缀）。
 */
const countRef = (text, key) => {
  const re = new RegExp(`t\\.${key}(?![A-Za-z0-9_])`, "g");
  return (text.match(re) ?? []).length;
};

check("the HintCard component exists", () => {
  assert.match(client, /function HintCard\(\{ text, children \}\)/);
});

check("the panel is portaled to document.body", () => {
  const start = client.indexOf("function HintCard(");
  const end = client.indexOf("\n    function FreeSearchSummary()", start);
  const block = client.slice(start, end);
  assert.ok(block.includes("react_dom.createPortal"), "the panel must leave the card via a portal");
  assert.ok(block.includes("document.body"), "the portal target must be document.body");
  assert.ok(block.includes('className: "dshfs-hintPanel"'));
});

check("the panel is fixed-positioned and themed for both schemes", () => {
  assert.match(client, /\.dshfs-hintPanel\{[^}]*position:fixed/);
  assert.match(client, /\.dshfs-hintPanel\{[^}]*max-width:320px/);
  // The dark rules are one long @media line, so look for the pair of facts in it.
  const dark = client.match(/@media \(prefers-color-scheme: dark\)\{\.dshfs-hintBtn[^\n]*/)?.[0] ?? "";
  assert.ok(dark.includes(".dshfs-hintPanel"), "dark mode must restyle the panel");
  assert.ok(dark.includes("#1e1f24"), "dark panel background missing");
});

for (const [hint, label, human] of CONVERTED) {
  check(`${human} shows its hint as a card, not as a paragraph`, () => {
    // Exactly one reference each: the card's `text` prop. No leftover <p>.
    assert.equal(countRef(client, hint), 1, `${hint} should appear once`);
    assert.match(client, new RegExp(`<HintCard|jsx\\(HintCard, \\{ text: t\\.${hint}`));
    assert.equal(
      client.includes(`className: "dshfs-hint",\n                        children: t.${hint},`),
      false,
      `${hint} still renders an inline paragraph`
    );
    // 名字带相同前缀的键（engineEnable / engineEnableHint）会互相误计，
    // 所以按「t.<key> 后面不是字母」计数。
    assert.equal(countRef(client, label), 1, `${label} should appear once`);
  });
}

check("Escape closes the card", () => {
  const start = client.indexOf("function HintCard(");
  const end = client.indexOf("\n    function FreeSearchSummary()", start);
  const block = client.slice(start, end);
  assert.match(block, /event\.key === "Escape"/);
  assert.match(block, /document\.addEventListener\("keydown", onKeyDown, true\)/);
});

check("focus opens the card and blur closes it", () => {
  const start = client.indexOf("function HintCard(");
  const end = client.indexOf("\n    function FreeSearchSummary()", start);
  const block = client.slice(start, end);
  assert.match(block, /onFocus: openNow/);
  assert.match(block, /onBlur: scheduleClose/);
  assert.match(block, /"aria-describedby": open \? id : undefined/);
});

check("hover opens after a short delay and survives the trip to the panel", () => {
  const start = client.indexOf("function HintCard(");
  const end = client.indexOf("\n    function FreeSearchSummary()", start);
  const block = client.slice(start, end);
  // The close delay must exceed the open delay so moving onto the panel keeps it open.
  const open = Number(block.match(/setTimeout\(\(\) => \{\n\s+openTimer\.current = null;\n\s+setOpen\(true\);\n\s+\}, (\d+)\)/)?.[1] ?? 0);
  assert.ok(open > 0 && open <= 300, `open delay should be short, got ${open}`);
  assert.match(block, /onPointerEnter/);
  assert.match(block, /onPointerLeave/);
});

check("touch has a path, because there is no hover there", () => {
  const start = client.indexOf("function HintCard(");
  const end = client.indexOf("\n    function FreeSearchSummary()", start);
  const block = client.slice(start, end);
  assert.match(block, /event\.pointerType/);
  assert.match(block, /lastPointer\.current === "touch"/);
});

check("the panel never overflows the viewport", () => {
  const start = client.indexOf("function HintCard(");
  const end = client.indexOf("\n    function FreeSearchSummary()", start);
  const block = client.slice(start, end);
  assert.match(block, /window\.innerWidth - margin/);
  assert.match(block, /window\.innerHeight - margin/);
});

check("the label text sits beside the icon button, not inside it", () => {
  // The button is 15px wide (icon only). Putting the label inside it squeezes
  // the label into a one-character-wide column.
  const start = client.indexOf("function HintCard(");
  const end = client.indexOf("\n    function FreeSearchSummary()", start);
  const block = client.slice(start, end);
  const buttonStart = block.indexOf("const trigger =");
  const buttonEnd = block.indexOf("return react_jsx_runtime.jsxs(\"span\", {", buttonStart);
  const button = block.slice(buttonStart, buttonEnd);
  assert.equal(/dshfs-hintText/.test(button), false, "the label text must not live inside the icon button");
  // The host lists the text span first, then the button.
  const host = block.slice(buttonEnd);
  const textAt = host.indexOf('className: "dshfs-hintText"');
  const triggerAt = host.indexOf("trigger,", textAt);
  assert.ok(textAt > 0, "the label text span is missing from the host");
  assert.ok(triggerAt > textAt, "the label text must render before the icon button");
});

check("clicking the icon does not toggle the surrounding checkbox", () => {
  // The icon lives inside <label class="dshfs-platform">, so a click would
  // otherwise flip the checkbox as a side effect.
  const start = client.indexOf("function HintCard(");
  const end = client.indexOf("\n    function FreeSearchSummary()", start);
  const block = client.slice(start, end);
  assert.match(block, /event\.preventDefault\(\)/);
  assert.match(block, /event\.stopPropagation\(\)/);
});

console.log(`OK: ${checks} hint card checks passed`);
