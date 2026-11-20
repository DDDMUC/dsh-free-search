// The card header shows only the plugin name now; the descriptive line under it
// is gone. The copy itself must stay — the plugin-list summary still uses it.
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("the header renders the name but no description line", () => {
  const headerAt = client.indexOf('className: "dshfs-header"');
  assert.ok(headerAt > 0, "header block not found");
  const block = client.slice(headerAt, client.indexOf('className: "dshfs-pending"', headerAt));
  assert.match(block, /dshfs-name/);
  assert.equal(/dshfs-description/.test(block), false, "the description span must be gone from the header");
});

check("the card no longer reads a description local", () => {
  assert.equal(/const description = t\.description;/.test(client), false);
});

check("the summary copy survives for the plugin-list row", () => {
  assert.match(client, /function FreeSearchSummary\(\)/);
  assert.match(client, /return tt\(active\)\.description;/);
  assert.equal(/^\s+description: "Free web search/m.test(client), true);
  assert.equal(/^\s+description: "免费搜索/m.test(client), true);
});

check("the dead header style rules were removed", () => {
  assert.equal(/\.dshfs-description\{/.test(client), false);
});

console.log(`OK: ${checks} header description checks passed`);
