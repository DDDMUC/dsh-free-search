// #101: the settings card must be reachable from the bundle page itself, not only
// from the "included components" row. DSH exposes two keyed seats:
//   plugins.bundle.config -> keyed by the bundle's package name (bundle page)
//   plugins.row.config    -> keyed by "<package name>#<row id>" (row page)
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
const patch = fs.readFileSync(new URL("cordis.patch.yml", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const rowId = (patch.match(/-\s+insert:\s*\n\s+-\s+id:\s*([a-z0-9-]+)/i) || [])[1];

check("cordis.patch.yml still declares exactly one row for the bundle", () => {
  assert.equal(rowId, "web-search-free");
});

check("the bundle-level seat is registered under the package name", () => {
  assert.match(client, /ctx\.slots\.inject\("plugins\.bundle\.config", \(\) =>/);
  const at = client.indexOf('name: "plugins.bundle.config"');
  assert.ok(at > 0, "bundle seat registration missing");
  const block = client.slice(at, at + 220);
  assert.match(block, new RegExp(`key: "${pkg.name}"`));
});

check("the row-level seat is kept, keyed package#row", () => {
  const at = client.indexOf('name: "plugins.row.config"');
  assert.ok(at > 0, "row seat registration missing");
  const block = client.slice(at, at + 220);
  assert.match(block, new RegExp(`key: "${pkg.name}#${rowId}"`));
});

check("both seats render the same card and summary handler", () => {
  assert.equal((client.match(/react_jsx_runtime\.jsx\(FreeSearchCard, \{ page: true \}\)/g) || []).length, 2);
  assert.equal((client.match(/slotProps\.view === "summary"/g) || []).length, 2);
});

console.log(`OK: ${checks} config-seat checks passed`);
