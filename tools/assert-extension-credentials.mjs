// 扩展区的凭据输入框：装好之后必须能在这里填 key，不用去改 YAML。
//
// 关键约束：凭据名**只能来自引擎包自己的 requiresKey**，客户端不许写死；
// 写入必须走现成的 credentials-set 路由（服务端 KEY_REF_MAP 里已由
// setExternalEngines 补上这些名字），不能另开一条写凭据的通道。
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

const extensionsHandler = () => {
  const at = index.indexOf("async extensions()");
  assert.ok(at > 0, "the extensions handler is missing");
  return index.slice(at, at + 2200);
};

check("the server reports which declared keys are configured", () => {
  const block = extensionsHandler();
  assert.match(block, /keysConfigured/, "the page needs to know whether a key is set");
  assert.match(block, /credentials\.resolve|credentialsSvc\.resolve/, "it probes the credential center, not config");
  assert.match(block, /credentialsAvailable/);
  // 只探测已装引擎声明过的名字，不遍历整张表。
  assert.match(block, /installed\.flatMap\(\(engine\) => \(Array\.isArray\(engine\.requiresKey\)/);
});

check("the client renders one input per declared key, not a hard-coded list", () => {
  const section = client.slice(client.indexOf('"data-dsh-section": "extensions"'), client.indexOf('"data-dsh-section": "extensions"') + 14000);
  assert.match(section, /const names = Array\.isArray\(engine\.requiresKey\) \? engine\.requiresKey : \[\]/);
  assert.match(section, /names\.map\(\(name\) =>/, "inputs follow the engine's declaration");
  assert.equal(/WEBZ_API_TOKEN/.test(section), false, "the client must not name a specific credential");
});

check("saving a key goes through the existing credentials route", () => {
  assert.match(client, /const saveExternalKey = async \(name\) =>/);
  assert.match(client, /await bridgeCredentialsSet\(name, value\)/, "reuse credentials-set, do not invent a route");
  assert.match(client, /await loadExtensions\(\)/, "refresh states after saving");
});

check("the input is a password field and the value is not kept after saving", () => {
  const section = client.slice(client.indexOf("names.map((name) =>"), client.indexOf("names.map((name) =>") + 3000);
  assert.match(section, /type: "password"/, "a credential must not render as plain text");
  // 保存成功后把草稿清空，避免明文长留在页面上。
  assert.match(client, /value: "", saving: false, saved: true/, "clear the draft after a successful save");
});

check("the declared key is what the engine actually receives", () => {
  // 服务端把 keys 按名字交给引擎；界面里输入的名字与 runner 读的名字同源。
  const at = index.indexOf("const registerExternalEngine");
  const block = index.slice(at, at + 900);
  assert.match(block, /externalCredentialNames\(engine\)/);
  assert.match(block, /keys\[name\] = value/);
});

console.log(`OK: ${checks} extension credential checks passed`);
