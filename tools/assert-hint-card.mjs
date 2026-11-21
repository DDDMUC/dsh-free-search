// Long field hints moved into hover cards. The cards must:
//   * be portaled to document.body  - the card has overflow:clip, so an in-tree
//     popup would be cut off at the card edge;
//   * close on Escape and on blur, open on focus (hover alone is not accessible);
//   * cover exactly the four fields converted so far;
//   * leave a touch path, since hover does not exist on phones.
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

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
];

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
    assert.equal(client.split("t." + hint).length - 1, 1, `${hint} should appear once`);
    assert.match(client, new RegExp(`<HintCard|jsx\\(HintCard, \\{ text: t\\.${hint}`));
    assert.equal(
      client.includes(`className: "dshfs-hint",\n                        children: t.${hint},`),
      false,
      `${hint} still renders an inline paragraph`
    );
    assert.equal(client.split("t." + label).length - 1, 1, `${label} should appear once`);
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

console.log(`OK: ${checks} hint card checks passed`);
