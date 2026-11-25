// 「扩展」分区的安装路径。
//
// 这里唯一危险的动作是把包名交给 pnpm。所以整条链路有一道硬闸：
// 包名必须命中服务端白名单 installableEngine()，客户端传什么都不作数。
// 断言直接从 lib/index.js 里读 handler 源码来钉这一点，而不是只看 UI。
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  INSTALLABLE_ENGINES,
  installableEngine,
} from "../lib/external_engines.js";
import {
  applyPnpmEvent,
  installStatus,
  isValidPackageName,
  resetInstallState,
  startInstall,
} from "../lib/external_install.js";

const root = new URL("..", import.meta.url);
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

// ------------------------------------------------------------------ 白名单
await check("the installable list is a hard-coded allowlist", async () => {
  assert.ok(INSTALLABLE_ENGINES.length >= 1, "the list must not be empty");
  for (const entry of INSTALLABLE_ENGINES) {
    assert.equal(typeof entry.packageName, "string");
    assert.ok(entry.packageName.length > 0);
    assert.ok(entry.label?.en, `${entry.packageName} needs an English label`);
    assert.ok(entry.description?.zh && entry.description?.en, `${entry.packageName} needs both descriptions`);
    assert.equal(Array.isArray(entry.requiresKey), true);
  }
  assert.equal(installableEngine("dsh-free-search-engine-webz")?.id, "webz");
  // Anything else is refused, including a same-prefix lookalike.
  assert.equal(installableEngine("dsh-free-search-engine-evil"), undefined);
  assert.equal(installableEngine("evil"), undefined);
  assert.equal(installableEngine(""), undefined);
  assert.equal(installableEngine(undefined), undefined);
});

await check("the install handler checks the allowlist, not the client input", async () => {
  const at = index.indexOf("async extensionsInstall(request)");
  assert.ok(at > 0, "the install handler is missing");
  const block = index.slice(at, at + 1400);
  assert.match(block, /const entry = installableEngine\(packageName\);/, "the allowlist must be consulted");
  assert.match(block, /if \(entry === undefined\)/, "an unknown package must be refused");
  assert.match(block, /code: "not-installable"/);
  // The name that reaches pnpm is the one from the request, but only after the
  // allowlist lookup — an unlisted name never gets there.
  assert.match(block, /await startInstall\(\{ profileDir, packageName \}\)/);
});

await check("link mode no longer blocks extension installs", async () => {
  // 装的是「另一个包」（扩展引擎），不是自己；本插件自己的 link 与它无关。
  // 自升级那条路径仍然拒绝 link 模式 —— 见 assert-extension-target.mjs。
  const at = index.indexOf("async extensionsInstall(request)");
  const block = index.slice(at, at + 1400);
  assert.equal(/code: "local-link-mode"/.test(block), false, "the own-link guard must not live here");
  assert.match(block, /await startInstall\(\{ profileDir, packageName \}\)/);
});

await check("a successful install rescans before answering", async () => {
  const at = index.indexOf("async extensionsInstall(request)");
  const block = index.slice(at, at + 1400);
  const installAt = block.indexOf("await startInstall");
  const rescanAt = block.indexOf("await extensions.rescan()");
  assert.ok(installAt > 0 && rescanAt > installAt, "the rescan must follow the install");
});

// ------------------------------------------------------------------ 包名
await check("package names are validated before they become an argument", async () => {
  assert.equal(isValidPackageName("dsh-free-search-engine-webz"), true);
  assert.equal(isValidPackageName("@scope/name"), true);
  assert.equal(isValidPackageName("@scope/name.with-dots"), true);
  // Flag injection: pnpm would read the rest as options.
  assert.equal(isValidPackageName("-g"), false);
  assert.equal(isValidPackageName("--global"), false);
  // Shell metacharacters: spawn runs with shell:false, but refuse them anyway.
  assert.equal(isValidPackageName("a;rm -rf /"), false);
  assert.equal(isValidPackageName("a b"), false);
  assert.equal(isValidPackageName("a/../../b"), false);
  assert.equal(isValidPackageName(""), false);
  assert.equal(isValidPackageName(undefined), false);
  assert.equal(isValidPackageName(42), false);
});

await check("pnpm is spawned without a shell", async () => {
  const src = fs.readFileSync(new URL("lib/external_install.js", root), "utf8");
  assert.match(src, /spawn\("pnpm", \["add", packageName, "--reporter=ndjson"\]/);
  assert.match(src, /shell: false/, "spawn must not go through a shell");
});

// ------------------------------------------------------------------ 进度
await check("ndjson events fold into stage + package count", async () => {
  const state = { stage: "resolution", imported: 0 };
  applyPnpmEvent(state, JSON.stringify({ name: "pnpm:stage", stage: "resolution_started" }));
  assert.equal(state.stage, "resolution");
  applyPnpmEvent(state, JSON.stringify({ name: "pnpm:stage", stage: "importing_started" }));
  assert.equal(state.stage, "importing");
  applyPnpmEvent(state, JSON.stringify({ name: "pnpm:progress", packageId: "a@1.0.0", status: "resolved" }));
  assert.equal(state.imported, 0, "resolved is not an import");
  applyPnpmEvent(state, JSON.stringify({ name: "pnpm:progress", packageId: "a@1.0.0", status: "imported" }));
  assert.equal(state.imported, 1);
  // The same package may report again; the count must not double.
  applyPnpmEvent(state, JSON.stringify({ name: "pnpm:progress", packageId: "a@1.0.0", status: "imported" }));
  assert.equal(state.imported, 1, "the counter is a set, not an event count");
  // A cached package counts as imported too.
  applyPnpmEvent(state, JSON.stringify({ name: "pnpm:progress", packageId: "b@2.0.0", status: "found_in_store" }));
  assert.equal(state.imported, 2);
  applyPnpmEvent(state, JSON.stringify({ name: "pnpm:summary" }));
  assert.equal(state.stage, "done");
});

await check("garbage lines are ignored, not fatal", async () => {
  const state = { stage: "resolution", imported: 0 };
  assert.equal(applyPnpmEvent(state, "not json"), false);
  assert.equal(applyPnpmEvent(state, JSON.stringify({ name: "pnpm:fetching-progress", status: "started" })), false);
  assert.equal(state.stage, "resolution");
});

await check("progress has no percentage field, because none exists", async () => {
  const status = installStatus("anything");
  assert.deepEqual(Object.keys(status).sort(), ["imported", "message", "ok", "packageName", "running", "stage"]);
  assert.equal("percent" in status, false, "there is no completion event per download, so no percentage may be shown");
  assert.equal(status.stage, "idle");
});

// ------------------------------------------------------------------ 安装
await check("a bad package name never reaches pnpm", async () => {
  resetInstallState();
  const result = await startInstall({ profileDir: "/tmp/does-not-exist", packageName: "-g" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-package-name");
});

await check("a failed pnpm run reports the last meaningful lines", async () => {
  resetInstallState();
  const result = await startInstall({
    profileDir: "/tmp/does-not-exist",
    packageName: "dsh-free-search-engine-webz",
    timeoutMs: 5000,
  });
  // pnpm is either missing or cannot find the dir; either way it must not throw.
  assert.equal(typeof result.ok, "boolean");
  if (!result.ok) {
    assert.ok(["install-failed", "install-timeout", "install-blocked"].includes(result.code), `unexpected code ${result.code}`);
    assert.equal(typeof result.message, "string");
  }
  assert.equal(installStatus("dsh-free-search-engine-webz").running, false, "the job must not stay running");
});

await check("the minimum-release-age refusal is explained, not surfaced as exit 1", async () => {
  const src = fs.readFileSync(new URL("lib/external_install.js", root), "utf8");
  assert.match(src, /ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION/);
  assert.match(src, /code: "install-blocked"/);
  assert.match(src, /minimumReleaseAge=0/);
});

// ------------------------------------------------------------------ 客户端
await check("the extensions section is the last nav entry and the last section", async () => {
  const nav = [...client.matchAll(/\{ id: "([a-z]+)", anchor: "dshfs-anchor-([a-z]+)" \}/g)].map((m) => m[1]);
  assert.equal(nav[nav.length - 1], "extensions", `nav order: ${nav.join(",")}`);
  const sections = [...client.matchAll(/"data-dsh-section": "([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(sections[sections.length - 1], "extensions");
});

await check("the client never builds a package name of its own", async () => {
  // The list comes from the server; the client only echoes packageName back.
  assert.match(client, /extensions\.installable\.map\(\(entry\) =>/);
  assert.match(client, /installExtension\(entry\.packageName\)/);
  assert.equal(/INSTALLABLE_ENGINES/.test(client), false, "the allowlist must live on the server only");
});

await check("installing goes through the bridge, never through the registry directly", async () => {
  assert.match(client, /bridgeExtensionsInstall\(packageName\)/);
  assert.match(client, /bridgeUrl\("extensions-install"\)/);
  // Progress is a read: it goes through bridgeRead, which retries once.
  assert.match(client, /bridgeRead\("extensions-progress"/);
  assert.equal(/npmjs\.org\/[a-z-]*engine/.test(client), false, "the page must not fetch packages itself");
});

await check("an installed package disappears from the available list", async () => {
  const at = index.indexOf("async extensions()");
  assert.ok(at > 0, "the list handler is missing");
  const block = index.slice(at, at + 900);
  assert.match(block, /installable: INSTALLABLE_ENGINES\.filter\(/, "the server filters installed ones out");
  assert.match(block, /!installed\.some\(\(engine\) => engine\.packageName === entry\.packageName\)/);
});

await check("an installable entry is one bordered line with a hover card", async () => {
  // 详情（包名 / 需要的 key / 描述）不能各占一行：行里只留名称，
  // 其余走 HintCard —— 和工具行、抓取开关同一形态。
  const at = client.indexOf('"data-dsh-section": "extensions"');
  const block = client.slice(at, at + 10000);
  assert.equal(/dshfs-extInfo/.test(block), false, "the stacked info column must be gone");
  assert.match(block, /className: "dshfs-extMain"/, "the name sits in one flex item");
  assert.match(block, /jsx\(HintCard, \{\s*text: detail,/s, "the details moved into the hover card");
  assert.match(block, /\.join\(\"\\n\"\)/, "detail lines are joined into one card body");
  // 带框：边框 + 圆角 + 内边距
  const row = client.match(/\.dshfs-extRow\{[^}]*\}/)?.[0] ?? "";
  assert.ok(row.includes("border:1px solid"), "the row needs a frame");
  assert.ok(row.includes("border-radius"), "the frame needs a radius");
  assert.ok(row.includes("padding:"), "the frame needs padding");
  assert.ok(row.includes("justify-content:space-between"), "name left, button right");
});

await check("progress gets its own line inside that frame", async () => {
  const at = client.indexOf('"data-dsh-section": "extensions"');
  const block = client.slice(at, at + 10000);
  assert.match(block, /dshfs-extProgressLine/);
  const line = client.match(/\.dshfs-extProgressLine\{[^}]*\}/)?.[0] ?? "";
  assert.ok(line.includes("flex:1 1 100%"), "the progress line takes the full width, pushing the row to two lines");
});

await check("ticking an installed engine writes allowedEngines", async () => {
  // The checkbox must go through the same allowlist path as built-in engines.
  const at = client.indexOf('"data-dsh-section": "extensions"');
  const block = client.slice(at, at + 10000);
  assert.match(block, /setAllowedEngines\(\(prev\) =>/);
  assert.match(block, /addFallbackEngine\(engine\.id\)/);
});

console.log(`OK: ${checks} extension install checks passed`);
