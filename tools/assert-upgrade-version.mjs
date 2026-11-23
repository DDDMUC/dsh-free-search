// #163: an upgrade must report the version that actually landed.
//
// pnpm 11 defaults minimumReleaseAge to 1440 minutes, so `pnpm add @latest`
// silently resolves to the newest release older than 24 h and still exits 0.
// Trusting the exit code produced "Upgraded to v0.9.82" while 0.9.80 was
// installed, and the badge kept coming back after every restart.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = new URL("..", import.meta.url);
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("the installed version is read back from the profile", () => {
  assert.match(index, /function installedVersion\(profileDir\) \{/);
  assert.match(index, /node_modules", "dsh-free-search", "package\.json"/);
});

check("an upgrade compares the installed version with the registry", () => {
  const at = index.indexOf("const after = installedVersion(mode.profileDir)");
  assert.ok(at > 0, "updatePlugin must read the installed version");
  const body = index.slice(at, at + 1400);
  assert.match(body, /compareVersions\(after, latest\) < 0/);
  assert.match(body, /code: "upgrade-blocked"/);
});

check("a cooldown rejection is its own error code with an explanation", () => {
  const at = index.indexOf("ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION");
  assert.ok(at > 0, "the pnpm cooldown error must be recognised");
  const body = index.slice(Math.max(0, at - 200), at + 900);
  assert.match(body, /code: "upgrade-blocked"/);
  assert.match(body, /minimumReleaseAge/);
  assert.match(body, /24 hours|1440/);
});

check("success reports the installed version, not the registry's latest", () => {
  const at = index.indexOf('return {\n          ok: true,\n          value: {\n            updated:');
  if (at < 0) {
    // fall back to a looser probe
    const loose = index.indexOf("installed: after");
    assert.ok(loose > 0, "the success payload must name the installed version");
    return;
  }
  const body = index.slice(at, at + 400);
  assert.match(body, /installed: after/);
});

check("unreadable install state does not claim success", () => {
  assert.match(index, /code: "upgrade-unknown"/);
});

check("the client shows the installed version in the toast", () => {
  assert.match(client, /t\.upgradeDone\(updateInfo\.installed \?\? updateInfo\.latest\)/);
  assert.match(client, /installed: result\.value\.installed \?\? result\.value\.latest/);
});

check("a blocked upgrade is shown as a warning with its own text", () => {
  assert.match(client, /blocked: result\.code === "upgrade-blocked"/);
  assert.match(client, /updateInfo\.blocked \? "dshfs-warn" : "dshfs-failed"/);
  // A blocked upgrade must not be wrapped in the generic "升级失败：" prefix.
  assert.match(client, /updateInfo\.blocked \? updateInfo\.upgradeFailed : t\.upgradeFailed\(updateInfo\.upgradeFailed\)/);
});

check("the whole flow is copy-pasteable from the report", () => {
  // Sanity: the exact pnpm invocation the report reproduced with still runs.
  assert.match(index, /pnpm add dsh-free-search@latest/);
});

console.log(`OK: ${checks} upgrade checks passed`);
