// Slash commands can be switched off: default on, persisted opt-out, prompt follows.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const { Config, buildBuiltinPromptBlocks } = await import(new URL("lib/index.js", root));
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("slashCommands defaults on and persists as a boolean", () => {
  assert.equal(Config({}).slashCommands.get(), true);
  assert.equal(Config({ slashCommands: false }).slashCommands.get(), false);
  assert.match(index, /slashCommands: z\.boolean\(\)\.default\(true\)/);
  assert.match(index, /"slashCommands"/);
});

check("the settings card loads, saves and renders the switch", () => {
  assert.match(client, /setSlashCommands\(v\.slashCommands !== false\)/);
  assert.match(client, /path: \["slashCommands"\], value: slashCommands !== false/);
  assert.match(client, /checked: slashCommands,/);
  assert.match(client, /slashCommandsLabel/);
});

check("both commands register only through the config-driven switch", () => {
  assert.match(client, /function registerSlashCommands\(\)/);
  assert.match(client, /syncSlashCommands\(view\?\.value\?\.slashCommands !== false\)/);
  const body = client.slice(client.indexOf("function registerSlashCommands()"));
  assert.match(body, /name: "free-search-engine"/);
  assert.match(body, /name: "free-search"/);
  assert.equal((client.match(/command\.register\(/g) || []).length, 2);
});

check("the prompt stops naming /free-search-engine when commands are off", () => {
  const on = buildBuiltinPromptBlocks({});
  const off = buildBuiltinPromptBlocks({ slashCommands: false });
  for (const lang of ["en", "zh"]) {
    assert.ok(on.constraints[lang].includes("/free-search-engine"), lang);
    assert.ok(!off.constraints[lang].includes("/free-search-engine"), lang);
  }
  assert.match(client, /cfg\.slashCommands === false \? copy\.engineControlSettings : copy\.engineControl/);
});

console.log(`OK: ${checks} slash-command checks passed`);
