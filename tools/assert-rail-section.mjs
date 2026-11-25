// The in-page rail follows dsh-url-router's panel-sections contract v1:
//   data-dsh-panel-section = <id>   exactly one element (the page root) = the current section
//   data-dsh-section       = <id>   on every section container (scroll target)
//   <a data-dsh-section="<id>" href="#/panel/dsh-free-search/<id>">  the rail entry
// Section ids are stable and language independent; the count is not fixed (8 today).
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));

const IDS = ["engines", "fallback", "pools", "behavior", "fetch", "performance", "prompt", "extensions"];

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("the card root publishes exactly one current-section attribute", () => {
  assert.equal((client.match(/"data-dsh-panel-section": railActive,/g) || []).length, 1);
  assert.match(client, /"data-dsh-panel-section": railActive,/);
});

check("the section ids are exactly the rail entries, in rail order", () => {
  const ids = [...client.matchAll(/\{ id: "([a-z0-9-]+)", anchor: "dshfs-anchor-[a-z0-9-]+" \}/g)].map((m) => m[1]);
  assert.deepEqual(ids, IDS);
});

check("every section container carries its own data-dsh-section", () => {
  for (const id of IDS.filter((value) => value !== "pools")) {
    const pattern = new RegExp(`"data-dsh-section": "${id}",`);
    assert.match(client, pattern, `section container missing for ${id}`);
  }
  // the two pool fields share the pools section (the second one passes undefined)
  assert.match(client, /"data-dsh-section": poolKey === "zh" \? "pools" : undefined,/);
});

check("rail entries have independent links that do not open the plugin row page", () => {
  assert.match(client, /href: `#\/panel\/dsh-free-search\/\$\{item\.id\}`/);
  assert.equal(client.includes("href: `#/panel/plugins/dsh-free-search/${item.id}`"), false);
  assert.equal(client.includes("PAGE_HASH"), false);
  assert.match(client, /"data-dsh-section": item\.id,/);
  assert.equal((client.match(/react_jsx_runtime\.jsx\("a", \{\r?\n\s+className: "dshfs-railItem"/g) || []).length, 1);
  assert.equal(pkg.name, "dsh-free-search");
});

check("a pasted section URL scrolls there, and the page never writes the URL", () => {
  assert.match(client, /parts\[0\] === "panel" && parts\[1\] === "dsh-free-search"\) return parts\[2\]/);
  assert.match(client, /window\.addEventListener\("hashchange", apply\)/);
  assert.equal(client.includes("location.hash ="), false);
  assert.equal(client.includes("history.pushState"), false);
  assert.equal(client.includes("history.replaceState"), false);
});

check("the sidebar label follows the DSH locale", () => {
  assert.match(client, /const PANEL_LABELS = \{/);
  assert.match(client, /ja: "無料検索"/);
  assert.match(client, /localeFace\?\.getSnapshot\?\.\(\) \?\? localeFace\?\.getLocale\?\.\(\)/);
  assert.match(client, /localeId\(snapshot\?\.active\)/);
});

check("current section is the one being read, not a guess at the last one", () => {
  // 81761e4: "at the bottom" only counts when the container can actually scroll
  assert.match(client, /scroller\.scrollHeight > scroller\.clientHeight \+ 8/);
  assert.match(client, /document\.documentElement\.scrollHeight > window\.innerHeight \+ 8/);
});

check("the page never writes the URL and reads no extra bridge route", () => {
  assert.equal(client.includes("location.hash ="), false);
  assert.equal(client.includes("bridgePromptPreview"), false);
});

console.log(`OK: ${checks} rail-section checks passed`);