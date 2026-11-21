// Mobile layout: the settings page owns its 150px desktop rail gutter via a class, and the
// <=560px block must not reintroduce rules for elements that no longer exist.
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const pageStart = client.indexOf("function FreeSearchPage()");
const pageEnd = client.indexOf("function FreeSearchPanelIcon()", pageStart);
const pageBlock = client.slice(pageStart, pageEnd);

const mobileStart = client.indexOf('@media (max-width: 560px){');
const mobileEnd = client.indexOf('@media (max-width: 560px) and (prefers-color-scheme: dark){', mobileStart);
const mobileBlock = client.slice(mobileStart, mobileEnd);

check("the page wrapper uses the dshfs-page class instead of an inline padding", () => {
  assert.ok(pageStart > 0, "FreeSearchPage not found");
  assert.match(pageBlock, /className: "dshfs-page"/);
  assert.equal(/padding:\s*"16px 150px 24px 24px"/.test(pageBlock), false, "desktop padding must live in CSS, not inline style");
});

check("the desktop padding is defined on .dshfs-page", () => {
  assert.match(client, /\.dshfs-page\{[^}]*padding:16px 150px 24px 24px[^}]*\}/);
});

check("the mobile breakpoint overrides the page padding", () => {
  assert.ok(mobileStart > 0, "mobile media block not found");
  assert.match(mobileBlock, /\.dshfs-page\{padding:16px 12px/);
});

check("the mobile block has no stale .dshfs-description rule", () => {
  assert.equal(/\.dshfs-description\{/.test(mobileBlock), false, "0.9.78 removed the description node");
});

check("the mobile block has no stale .dshfs-select target", () => {
  assert.equal(/\.dshfs-select/.test(mobileBlock), false, "0.9.78 replaced native selects with Dropdown");
});

check("the mobile section tabs are in the document flow and have no fixed host offset", () => {
  assert.match(client, /className: "dshfs-mobileNav"/);
  assert.equal(/dshfs-railPage/.test(client), false, "the old fixed mobile rail must be gone");
  assert.equal(/data-dshfs-page-host/.test(client), false, "the old runtime host marker must be gone");
});

console.log(`OK: ${checks} mobile layout checks passed`);
