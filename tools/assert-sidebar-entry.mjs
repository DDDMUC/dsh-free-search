// #129: default-on sidebar entry, persisted opt-out, and a /free-search fallback.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const { Config } = await import(new URL("lib/index.js", root));
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("sidebarEntry defaults on and persists as a boolean", () => {
  assert.equal(Config({}).sidebarEntry.get(), true);
  assert.equal(Config({ sidebarEntry: false }).sidebarEntry.get(), false);
  assert.match(index, /sidebarEntry: z\.boolean\(\)\.default\(true\)/);
  assert.match(index, /"sidebarEntry"/);
});

check("the settings card loads, saves and renders the switch", () => {
  assert.match(client, /useState\(true\).*sidebarEntry|sidebarEntry.*useState\(true\)/s);
  assert.match(client, /setSidebarEntry\(v\.sidebarEntry !== false\)/);
  assert.match(client, /path: \["sidebarEntry"\], value: sidebarEntry !== false/);
  assert.match(client, /sidebarEntryLabel/);
});

check("the sidebar registration can be disposed and re-created from config", () => {
  assert.match(client, /ctx\.slots\.inject\("sidebar\.panellist"/);
  assert.match(client, /sidebarEntryDispose/);
  assert.match(client, /sidebarEntry !== false/);
});

check("a /free-search action opens the panel when the entry is hidden", () => {
  assert.match(client, /name: "free-search"/);
  assert.match(client, /kind: "action"/);
  assert.match(client, /selectPanel\?\.\("dsh-free-search"\)/);
});

console.log(`OK: ${checks} sidebar-entry checks passed`);
