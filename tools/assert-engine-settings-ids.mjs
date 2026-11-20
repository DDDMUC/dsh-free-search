// #153 follow-up: the Tavily row must expose its "Settings" button, otherwise
// the new endpoint field is unreachable in the UI. ENGINE_SETTINGS_IDS gates
// renderEngineSettingsButton, and renderEngineSettings has no branch for an id
// that is missing from that list.
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const settingsIds = () => {
  const m = client.match(/const ENGINE_SETTINGS_IDS = \[([^\]]+)\];/);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
};

const branches = () => [...client.matchAll(/id === "([a-z0-9-]+)"\) \{/g)].map((m) => m[1]);

check("tavily is listed in ENGINE_SETTINGS_IDS", () => {
  assert.ok(settingsIds().includes("tavily"), `ENGINE_SETTINGS_IDS = ${settingsIds().join(", ")}`);
});

check("every engine that has a settings branch is reachable", () => {
  const gated = new Set(settingsIds());
  const withBranch = branches().filter((id) =>
    // A branch means `if (id === "x") { fields = [...] }` plus the else-if chain.
    client.includes(`} else if (id === "${id}") {`) || client.includes(`if (id === "${id}") {`)
  );
  const unreachable = withBranch.filter((id) => !gated.has(id));
  assert.deepEqual(unreachable, [], `settings branches unreachable: ${unreachable.join(", ")}`);
});

check("the settings button is gated by that list", () => {
  // Rows without settings now render an invisible placeholder so every row keeps
  // the same columns; the gate still decides whether the button is usable.
  assert.match(client, /const hasSettings = engineHasSettings\(id\);/);
  assert.match(client, /disabled: !ready \|\| saving \|\| !hasSettings/);
  assert.match(client, /if \(!hasSettings\) return;/);
});

console.log(`OK: ${checks} engine settings reachability checks passed`);
