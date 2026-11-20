// The fallback rows must keep one set of columns: engines without advanced
// settings render an invisible placeholder button instead of dropping the cell,
// and the key input has a fixed basis so it never stretches.
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("rows without settings still render the button cell", () => {
  const start = client.indexOf("const renderEngineSettingsButton = (id) => {");
  assert.ok(start > 0, "button renderer not found");
  const end = client.indexOf("\n      };", start);
  const block = client.slice(start, end);
  assert.equal(/return null;/.test(block), false, "no early bail-out any more");
  assert.match(block, /visibility: "hidden"/);
});

check("the placeholder is inert", () => {
  const start = client.indexOf("const renderEngineSettingsButton = (id) => {");
  const end = client.indexOf("\n      };", start);
  const block = client.slice(start, end);
  assert.match(block, /aria-hidden/);
  assert.match(block, /tabIndex: hasSettings \? undefined : -1/);
  assert.match(block, /if \(!hasSettings\) return;/);
  assert.match(block, /disabled: !ready \|\| saving \|\| !hasSettings/);
});

check("the button column has a fixed width", () => {
  assert.match(client, /\.dshfs-engineSettingsBtn\{flex:none;width:56px\}/);
});

check("the key input does not grow to fill the freed space", () => {
  assert.match(client, /\.dshfs-priorityKey\{flex:0 1 360px;/);
});

console.log(`OK: ${checks} fallback row alignment checks passed`);
