// 断言修正：link 模式不再拦扩展安装；安装目标必须是"这一份插件所在的 profile"。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

const handlerBlock = () => {
  const at = index.indexOf("async extensionsInstall(request)");
  assert.ok(at > 0, "the install handler is missing");
  return index.slice(at, at + 1400);
};

check("a successful extension install no longer refuses link mode", () => {
  const block = handlerBlock();
  assert.equal(/code: "local-link-mode"/.test(block), false, "extension installs must not be blocked by the plugin's own link");
});

check("the self-upgrade path still refuses link mode", () => {
  const at = index.indexOf("async updatePlugin()");
  assert.ok(at > 0, "updatePlugin is missing");
  const block = index.slice(at, at + 600);
  assert.match(block, /if \(mode\.isLink\)/, "self-upgrade must keep refusing a symlinked install");
  assert.match(block, /code: "local-link-mode"/);
});

check("installs go to the profile that holds this very copy of the plugin", () => {
  const block = handlerBlock();
  void block;
  assert.match(index, /function activeProfileDir\(root = path\.join\(dshHomeDir\(\), "profiles"\), selfDir = null\) \{/);
  assert.match(index, /profileDir: \(\) => activeProfileDir\(\) \?\? detectInstallMode\(\)\?\.profileDir \?\? null/);
});

check("activeProfileDir matches by realpath, not by scan order", () => {
  const at = index.indexOf("function activeProfileDir(");
  const block = index.slice(at, index.indexOf("function detectInstallMode("));
  assert.match(block, /fs\.realpathSync\(new URL\("\.\.", import\.meta\.url\)\)/, "the plugin's own directory anchors the match");
  assert.match(block, /real = fs\.realpathSync\(pkgPath\)/, "each candidate is resolved through its symlink");
  assert.match(block, /path\.resolve\(real\) === path\.resolve\(self\)/);
});

check("the list response says where it would install", () => {
  const at = index.indexOf("async extensions()");
  const block = index.slice(at, at + 1200);
  assert.match(block, /canInstall: profileDir !== null/);
  assert.match(block, /installProfile:/);
  assert.match(block, /path\.basename\(profileDir\)/);
  assert.equal(/installableInLinkMode/.test(block), false, "the misleading field is gone");
});

check("the install button is gated on canInstall, not on link mode", () => {
  assert.match(client, /disabled: !ready \|\| saving \|\| running \|\| !extensions\.canInstall/);
  assert.equal(/extensions\.linkMode/.test(client), false, "the old flag must not gate anything");
});

check("the page shows which profile it will install into", () => {
  assert.match(client, /extInstallInto: \(p\) =>/);
  assert.match(client, /t\.extInstallInto\(extensions\.installProfile/);
  assert.match(client, /t\.extNoProfile/);
});

console.log(`OK: ${checks} install-target checks passed`);
