// The three global toggles (sidebar entry / slash commands / keyless-first)
// belong at the bottom of the settings page, below prompt management.
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const indexOf = (needle) => client.indexOf(needle);

check("the prompt section comes before the toggles", () => {
  const prompt = indexOf('"data-dsh-section": "prompt"');
  const sidebar = indexOf("t.sidebarEntryLabel,");
  assert.ok(prompt > 0, "prompt section not found");
  assert.ok(sidebar > 0, "sidebar toggle not found");
  assert.ok(prompt < sidebar, "toggles must render after the prompt section");
});

check("the toggles stay together and in order", () => {
  const sidebar = indexOf("t.sidebarEntryLabel,");
  const slash = indexOf("t.slashCommandsLabel,");
  const keyless = indexOf("t.keylessFirstLabel,");
  assert.ok(sidebar < slash && slash < keyless, "toggle order changed");
  // They must be adjacent: no other field label between them.
  const between = client.slice(sidebar, keyless);
  assert.equal(/data-dsh-section/.test(between), false, "another section sits between the toggles");
});

check("the toggles come last, after every other labelled section", () => {
  const sections = [...client.matchAll(/"data-dsh-section": "([a-z]+)"/g)].map((m) => m[1]);
  const promptIdx = sections.indexOf("prompt");
  assert.ok(promptIdx >= 0, "prompt section missing");
  assert.equal(promptIdx, sections.length - 1, `prompt must be the last labelled section, got ${sections.join(",")}`);
});

check("the nav rail order still matches the page", () => {
  const nav = [...client.matchAll(/\{ id: "([a-z]+)", anchor: "dshfs-anchor-([a-z]+)" \}/g)].map((m) => m[1]);
  assert.deepEqual(nav, ["engines", "fallback", "pools", "behavior", "fetch", "performance", "prompt"]);
});

console.log(`OK: ${checks} settings order checks passed`);
