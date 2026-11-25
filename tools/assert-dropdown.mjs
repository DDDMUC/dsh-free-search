// The settings page no longer uses native <select>: its option popup is drawn by
// the OS and cannot follow the card's theme, so every dropdown is the custom
// Dropdown component (button + panel) that keeps the same `onChange({ target })`
// contract.
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("no native select elements are left", () => {
  const native = (client.match(/jsx[s]?\("select"/g) || []).length;
  assert.equal(native, 0, `${native} native selects remain`);
});

check("every dropdown goes through the custom component", () => {
  const uses = (client.match(/jsx[s]?\(Dropdown,/g) || []).length;
  assert.equal(uses, 10, `expected 10 Dropdown usages, found ${uses}`);
});

check("the component keeps the select contract", () => {
  const start = client.indexOf("function Dropdown(");
  assert.ok(start > 0, "Dropdown component missing");
  const end = client.indexOf("\n    function FreeSearchSummary()", start);
  const block = client.slice(start, end);
  // onChange({ target: { value } }) keeps every existing handler untouched.
  assert.match(block, /onChange\(\{ target: \{ value: option\.value \} \}\)/);
  assert.match(block, /"aria-haspopup": "listbox"/);
  assert.match(block, /role: "listbox"/);
  assert.match(block, /"aria-selected": index === currentIndex/);
});

check("keyboard support covers the usual keys", () => {
  const start = client.indexOf("function Dropdown(");
  const end = client.indexOf("\n    function FreeSearchSummary()", start);
  const block = client.slice(start, end);
  for (const key of ["Escape", "ArrowDown", "ArrowUp", "Home", "End", "Enter", "Tab"]) {
    assert.ok(block.includes(`"${key}"`), `missing key handling: ${key}`);
  }
});

check("the panel scrolls instead of growing without bound", () => {
  assert.match(client, /\.dshfs-ddPanel\{[^}]*max-height:280px/);
  assert.match(client, /\.dshfs-ddPanel\{[^}]*overflow-y:auto/);
});

check("the popup is themed for light and dark", () => {
  const dark = client.match(/@media \(prefers-color-scheme: dark\)\{\.dshfs-ddButton[^\n]*/)?.[0] ?? "";
  assert.match(client, /\.dshfs-ddPanel\{[^}]*background:#fff/);
  assert.ok(dark.includes(".dshfs-ddPanel"), "the dark-mode rule must cover the panel");
  assert.ok(dark.includes("#1e1f24"), "the dark panel background is missing");
});

console.log(`OK: ${checks} dropdown checks passed`);
