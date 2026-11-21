// Field headings and checkbox chrome. Two separate complaints:
//   1. .dshfs-label (the line above a field) had the same weight as the text
//      inside the controls, so it read as body copy rather than as a heading.
//   2. The checkbox grids used the native OS control (square + system accent),
//      which looks different on every platform and reads as noise in a row of 40.
// This pins both: the heading must stay heavier than body copy, and the checkbox
// must be drawn by the stylesheet rather than left to the OS.
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const rule = (selector) => {
  const at = client.indexOf(selector + "{");
  if (at < 0) return "";
  return client.slice(at, client.indexOf("}", at) + 1);
};

check("the field heading is heavier and larger than body copy", () => {
  const label = rule(".dshfs-label");
  assert.ok(label, ".dshfs-label rule missing");
  const size = Number(label.match(/font-size:(\d+)px/)?.[1]);
  const weight = Number(label.match(/font-weight:(\d+)/)?.[1]);
  // Hint text is 13px, control text is 13-14px.
  assert.ok(size >= 15, `heading must be >= 15px, got ${size}`);
  assert.ok(weight >= 600, `heading must be >= 600, got ${weight}`);
});

check("the checkbox is drawn by the stylesheet, not by the OS", () => {
  // appearance:none is what actually removes the native square.
  assert.match(client, /\.dshfs-platform input[^{]*\{[^}]*appearance:none/);
  assert.match(client, /\.dshfs-check input[^{]*\{[^}]*appearance:none/);
});

check("the checkmark is a CSS shape, not a Unicode glyph", () => {
  assert.match(client, /\.dshfs-platform input:checked::after[^{]*\{[^}]*content:''/);
  assert.match(client, /\.dshfs-platform input:checked::after[^{]*\{[^}]*border-width:0 2px 2px 0/);
});

check("the indeterminate state has its own glyph", () => {
  // "Select all" sets input.indeterminate in JS; the OS would draw a bar, we draw ours.
  assert.match(client, /input:indeterminate::after[^{]*\{[^}]*background:#fff/);
  assert.match(client, /node\.indeterminate = disabledTools\.length > 0/);
});

check("checkboxes keep a visible focus ring", () => {
  assert.match(client, /\.dshfs-platform input:focus-visible[^{]*\{[^}]*box-shadow:0 0 0 3px/);
});

check("both themes are covered", () => {
  const dark = client.slice(client.indexOf("@media (prefers-color-scheme: dark){.dshfs-platform{"));
  const block = dark.slice(0, dark.indexOf("}}") + 2);
  assert.ok(block.includes(".dshfs-check input:checked"), "dark mode must restate the checked fill");
  assert.ok(block.includes("#0a84ff"), "dark mode accent missing");
});

check("the checkbox groups keep wrapping instead of overflowing", () => {
  const groups = rule(".dshfs-platforms");
  assert.match(groups, /flex-wrap:wrap/);
});

check("the select-all row does not stretch across the column", () => {
  assert.match(rule(".dshfs-selectAll"), /align-self:flex-start/);
});

check("the tool row no longer squeezes its checkbox into a fixed 150px box", () => {
  const toolPlatform = rule(".dshfs-toolRow .dshfs-platform");
  assert.ok(toolPlatform, "tool row platform rule missing");
  assert.match(toolPlatform, /width:auto/);
});

console.log(`OK: ${checks} field heading and checkbox checks passed`);
