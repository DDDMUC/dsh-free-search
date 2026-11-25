// 加载路径的性能回归：三条约定必须成立，否则设置页会白等。
//
// 1. 打开设置页只发一次 describe（卡片复用，不再各发一条）
// 2. 写操作之后重新读取，不吃缓存
// 3. describe 响应不含 schema（客户端从不读它，8.9KB 纯冗余）
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

check("设置页只读一次配置，卡片复用同一个 promise", () => {
  assert.match(client, /let sharedDescribePromise = null;/);
  assert.match(client, /const readSettingsOnce = \(\) => \(sharedDescribePromise \?\?= bridgeDescribe\(\)\)/);
  // 卡片首帧走共享，而不是自己再发一条
  const card = client.slice(client.indexOf("react.useEffect(() => {\n        // 首帧复用"), client.indexOf("const select = (value) =>"));
  assert.match(card, /readSettingsOnce\(\)/, "the card must reuse the shared read");
  assert.match(card, /load\(result\)/, "the card must feed the shared result into load");
  // apply() 里也走共享
  assert.match(client, /const initialSettings = readSettingsOnce\(\);/);
});

check("首帧之外的读取都绕过缓存", () => {
  assert.match(client, /const invalidateSettingsCache = \(\) => \{/);
  const calls = (client.match(/invalidateSettingsCache\(\);/g) ?? []).length;
  assert.ok(calls >= 3, `expected the save/discard/restore paths to bypass the cache, found ${calls}`);
});

check("describe 响应不再回传 schema", () => {
  const view = index.slice(index.indexOf("function toView(descriptor)"), index.indexOf("/**", index.indexOf("function toView(descriptor)")));
  assert.doesNotMatch(view, /schema: descriptor\.schema/, "the bridge must not ship the whole schema");
  assert.match(view, /ns: String\(descriptor\.ns\)/);
  assert.match(view, /value: descriptor\.value/);
  // 客户端确实从不读它
  assert.equal((client.match(/view\.schema/g) ?? []).length, 0);
});

check("凭据状态一次并发，而不是 32 次串行", () => {
  assert.match(index, /await Promise\.all\(/, "credentialsStatus must fan out");
  const fn = index.slice(index.indexOf("async credentialsStatus()"), index.indexOf("async credentialsSet("));
  assert.equal(/for \(const \[settingsKey, ref\] of Object\.entries\(KEY_REF_MAP\)\) \{\s*try \{\s*const info = await/.test(fn), false, "the serial loop must be gone");
});

console.log(`OK: ${checks} load-path checks passed`);
