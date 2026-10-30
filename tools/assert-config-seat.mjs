// #101: the settings card is reachable from the plugin's own (bundle) page, not
// only from the row inside "Included components".
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("the card is registered on the bundle seat, keyed by the package name", () => {
  assert.match(
    client,
    /ctx\.slots\.inject\("plugins\.bundle\.config", \(\) =>\s*\n\s*ctx\.slots\.register\(\s*\n\s*\{\s*\n\s*name: "plugins\.bundle\.config",\s*\n\s*key: "dsh-free-search",/
  );
  assert.equal(pkg.name, "dsh-free-search", "bundle seat key must match the package name");
});

check("the row seat is kept for the older entry point", () => {
  assert.match(client, /name: "plugins\.row\.config"/);
  assert.match(client, /key: "dsh-free-search#web-search-free"/);
});

check("both seats share one renderer and the summary view", () => {
  assert.equal((client.match(/view === "summary"/g) || []).length, 2);
  assert.equal((client.match(/jsx\(FreeSearchCard, \{ page: true \}\)/g) || []).length, 2);
});

check("slots stays in the plugin's inject list", () => {
  assert.match(client, /const inject = \["slots", "commandUi"\];/);
});

console.log(`OK: ${checks} config-seat checks passed`);