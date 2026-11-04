// The plugin ships its own check-for-update / one-click upgrade pair in the card
// footer. npm installs upgrade through pnpm; local link installs point at the
// npm page instead, because pulling the source repo is the update path there.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = new URL("..", import.meta.url);
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
const { compareVersions, detectInstallMode, fetchLatestVersion } = await import(new URL("lib/index.js", root));

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

await check("versions compare by major, minor then patch", () => {
  assert.equal(compareVersions("0.9.31", "0.9.30"), 1);
  assert.equal(compareVersions("0.9.30", "0.9.31"), -1);
  assert.equal(compareVersions("0.9.31", "0.9.31"), 0);
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("1.0.0", "0.99.99"), 1);
  assert.equal(compareVersions("v0.9.31", "0.9.31"), 0);
  assert.equal(compareVersions("garbage", "0.0.0"), 0);
});

await check("the registry probe reads the version and identifies itself", async () => {
  const realFetch = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, options) => {
    seen = { url: String(url), headers: options.headers };
    return { ok: true, json: async () => ({ version: "9.9.9" }) };
  };
  try {
    assert.equal(await fetchLatestVersion(), "9.9.9");
    assert.equal(seen.url, "https://registry.npmjs.org/dsh-free-search/latest");
    assert.equal(seen.headers["user-agent"], "deepseek-harness/free-search");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("a registry error or a bad body yields null instead of throwing", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
    assert.equal(await fetchLatestVersion(), null);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
    assert.equal(await fetchLatestVersion(), null);
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    assert.equal(await fetchLatestVersion(), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("a profile with an installed copy is detected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dshfs-profiles-"));
  try {
    fs.mkdirSync(path.join(dir, "web", "node_modules", "dsh-free-search"), { recursive: true });
    const mode = detectInstallMode(dir);
    assert.equal(mode.isLink, false);
    assert.equal(mode.profileDir, path.join(dir, "web"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

await check("a real install wins over a linked development profile", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dshfs-profiles-"));
  try {
    const source = path.join(dir, "source");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(path.join(dir, "desktop", "node_modules"), { recursive: true });
    fs.symlinkSync(source, path.join(dir, "desktop", "node_modules", "dsh-free-search"), "junction");
    fs.mkdirSync(path.join(dir, "web", "node_modules", "dsh-free-search"), { recursive: true });
    const mode = detectInstallMode(dir);
    assert.equal(mode.isLink, false);
    assert.equal(mode.profileDir, path.join(dir, "web"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

await check("no installed copy means no upgrade target", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dshfs-profiles-"));
  try {
    assert.equal(detectInstallMode(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

await check("the client offers the check button and the update flow", () => {
  for (const token of [
    "dshfs-updatePill",
    "dshfs-updateIcon",
    "dshfs-updateOk",
    "bridgeCheckUpdate",
    "runCheckUpdate",
    "runUpdate",
    "updateInfo",
  ]) {
    assert.equal(client.includes(token), true, `client is missing ${token}`);
  }
  assert.match(client, /className: "dshfs-version", children: "v" \+ PLUGIN_VERSION/);
});

await check("the server wires both bridge routes and the upgrade command", () => {
  assert.match(index, /path: `\$\{BRIDGE_PREFIX\}\/check-update`/);
  assert.match(index, /path: `\$\{BRIDGE_PREFIX\}\/update`/);
  assert.match(index, /async checkUpdate\(\)/);
  assert.match(index, /async updatePlugin\(\)/);
  assert.match(index, /import \{ exec, execFile \} from "node:child_process";/);
  assert.match(index, /exec\("pnpm add dsh-free-search@latest"/);
});

await check("the card version tracks package.json", () => {
  const version = client.match(/const PLUGIN_VERSION = "(\d+\.\d+\.\d+)";/);
  assert.ok(version, "PLUGIN_VERSION is missing");
  assert.equal(version[1], pkg.version);
});

console.log(`OK: ${checks} updater checks passed`);
