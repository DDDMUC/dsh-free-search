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
  const sidebar = indexOf("children: t.sidebarEntryLabel");
  assert.ok(prompt > 0, "prompt section not found");
  assert.ok(sidebar > 0, "sidebar toggle not found");
  assert.ok(prompt < sidebar, "toggles must render after the prompt section");
});

check("the toggles stay together and in order", () => {
  const sidebar = indexOf("children: t.sidebarEntryLabel");
  const slash = indexOf("children: t.slashCommandsLabel");
  const keyless = indexOf("children: t.keylessFirstLabel");
  assert.ok(sidebar < slash && slash < keyless, "toggle order changed");
  // They must be adjacent: no other field label between them.
  const between = client.slice(sidebar, keyless);
  assert.equal(/data-dsh-section/.test(between), false, "another section sits between the toggles");
});

check("extensions is the last labelled section, right before the toggles", () => {
  const sections = [...client.matchAll(/"data-dsh-section": "([a-z]+)"/g)].map((m) => m[1]);
  const extIdx = sections.indexOf("extensions");
  const promptIdx = sections.indexOf("prompt");
  assert.ok(promptIdx >= 0, "prompt section missing");
  assert.ok(extIdx >= 0, "extensions section missing");
  assert.ok(extIdx > promptIdx, "extensions must come after prompt management");
  assert.equal(extIdx, sections.length - 1, `extensions must be the last labelled section, got ${sections.join(",")}`);
  // The toggles still sit below prompt management; the extensions section is
  // the very last block, so it renders after them.
  const ext = client.indexOf('"data-dsh-section": "extensions"');
  const toggles = client.indexOf('className: "dshfs-toggles"');
  assert.ok(toggles < ext, "the extensions section must be the bottom-most block");
});

check("the nav rail order still matches the page", () => {
  const nav = [...client.matchAll(/\{ id: "([a-z]+)", anchor: "dshfs-anchor-([a-z]+)" \}/g)].map((m) => m[1]);
  assert.deepEqual(nav, ["engines", "fallback", "pools", "behavior", "fetch", "performance", "prompt", "extensions"]);
});

check("the three global toggles share one row", () => {
  // They are one visual group at the bottom of the page, so they must sit in a
  // single flex row rather than three stacked fields.
  assert.match(client, /className: "dshfs-toggles"/);
  const row = client.match(/\.dshfs-toggles\{[^}]*\}/)?.[0] ?? "";
  assert.ok(row.includes("display:flex"), "the toggle row must be a flex container");
  assert.ok(row.includes("flex-wrap:wrap"), "the toggle row must wrap on narrow screens");
  // All three labels must live inside that one container.
  const at = client.indexOf("className: \"dshfs-toggles\"");
  const toggles = client.slice(at, client.indexOf("dshfs-resultRow", at));
  for (const label of ["t.sidebarEntryLabel", "t.slashCommandsLabel", "t.keylessFirstLabel"]) {
    assert.ok(toggles.includes("children: " + label), label + " is not inside the toggle row");
  }
});

console.log(`OK: ${checks} settings order checks passed`);
