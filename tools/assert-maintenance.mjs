// Maintenance surface: CI runs the whole assertion suite, releases go through
// one script, and the settings page can undo the provider takeover explicitly.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("CI runs every assertion script on the supported Node lines", () => {
  const workflow = fs.readFileSync(new URL(".github/workflows/ci.yml", root), "utf8");
  assert.match(workflow, /node: \[20, 22, 24\]/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm pack --dry-run/);
});

check("npm test runs the whole offline suite", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
  assert.equal(pkg.scripts?.test, "node tools/run-assertions.mjs");
  const runner = fs.readFileSync(new URL("tools/run-assertions.mjs", root), "utf8");
  assert.match(runner, /assert-.*\.mjs/);
});

check("the release script bumps, verifies and can publish", () => {
  const release = fs.readFileSync(new URL("tools/release.mjs", root), "utf8");
  assert.match(release, /assert-.*\.mjs/);
  assert.match(release, /PLUGIN_VERSION/);
  assert.match(release, /--publish/);
  assert.match(release, /\["publish"/);
  assert.match(release, /git\("tag", tag\)/);
});

check("the bridge can restore the official providers", () => {
  assert.match(index, /async restoreOfficialProvider\(\)/);
  assert.match(index, /path: `\$\{BRIDGE_PREFIX\}\/restore-provider`/);
  assert.match(index, /value: "deepseek-official"/);
  assert.match(index, /value: "http"/);
});

check("the settings page offers the restore button", () => {
  assert.match(client, /bridgeRestoreProvider/);
  assert.match(client, /children: restoreRunning \? t\.restoringOfficial : t\.restoreOfficial/);
  assert.match(client, /restoreOfficialHint/);
});

console.log(`OK: ${checks} maintenance checks passed`);
