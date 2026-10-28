// The in-page rail exposes a machine-readable active section on the card root:
// data-dsh-fs-section = engines | fallback | pools | behavior | fetch | performance
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("the card root carries data-dsh-fs-section bound to the active rail item", () => {
  assert.match(client, /"data-dsh-fs-section": railActive,/);
});

check("the attribute lives on the same element as the card class", () => {
  const at = client.indexOf('"data-dsh-fs-section": railActive,');
  const before = client.slice(Math.max(0, at - 400), at);
  assert.match(before, /className: \(open \? "dshfs-card dshfs-cardOpen" : "dshfs-card"\)/);
});

check("railActive is initialised from NAV_ITEMS and updated by the scroll spy", () => {
  assert.match(client, /const \[railActive, setRailActive\] = react\.useState\(NAV_ITEMS\[0\]\.id\);/);
  assert.match(client, /setRailActive\(current\);/);
  assert.match(client, /setRailActive\(id\);/);
});

check("the section ids are exactly the six rail entries", () => {
  const ids = [...client.matchAll(/\{ id: "([a-z]+)", anchor: "dshfs-anchor-[a-z]+" \}/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["engines", "fallback", "pools", "behavior", "fetch", "performance"]);
});

console.log(`OK: ${checks} rail-section checks passed`);