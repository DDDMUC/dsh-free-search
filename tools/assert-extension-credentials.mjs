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
  assert.match(section, /names\.map\(\(name, index\) =>/, "inputs follow the engine's declaration");
  assert.equal(/WEBZ_API_TOKEN/.test(section), false, "the client must not name a specific credential");
});

check("an installed engine row matches the built-in engine row", () => {
  // 已装扩展不能再长成另一套两行卡片：它必须复用内置引擎行的那组 class，
  // 否则同一个列表里会出现两种行高、两种状态表达。
  const section = client.slice(client.indexOf('"data-dsh-section": "extensions"'), client.indexOf('"data-dsh-section": "extensions"') + 16000);
  const installed = section.slice(section.indexOf("extensions.installed.map"), section.indexOf("extensions.failures.length"));
  assert.match(installed, /className: "dshfs-priorityRow"/, "the row must reuse the built-in row class");
  assert.match(installed, /className: "dshfs-priorityName"/, "the name must reuse the built-in name class");
  assert.match(installed, /dshfs-keyStatus dshfs-keyStatus-/, "the row needs the 8px status dot, not a text label");
  assert.match(installed, /className: hasDraft \? "dshfs-priorityKey dshfs-priorityKeyDirty" : "dshfs-priorityKey"/, "the input must reuse the built-in key field");
  // 角标是内置引擎的 badge；外部包的名字由包自己给，不该再拼一个 (API KEY)。
  assert.equal(/\(API KEY\)/.test(installed), false, "no synthetic API KEY badge on external engines");
  assert.equal(/className: "dshfs-extRow"/.test(installed), false, "the installed row must not use the installable-only frame");
  // 状态点必须查外部凭据名，否则配好 key 之后仍显示橙色「未配置」。
  assert.match(client, /extensions\.keysConfigured\?\.\[name\] === true/);
});

check("the extensions section has no enable checkbox of its own", () => {
  // 启用状态只有一个来源：上面「全局启用的搜索引擎」里的「外部 (c/d)」组。
  // 扩展区再画一个勾选框就是两处开关 + 两套行为（白名单那处会把 provider
  // 重置成 auto，还有「至少保留一个」的保护），所以这里必须没有。
  const at = client.indexOf('"data-dsh-section": "extensions"');
  const section = client.slice(at, at + 16000);
  const installed = section.slice(section.indexOf("extensions.installed.map"), section.indexOf("extensions.failures.length"));
  assert.equal(/dshfs-check/.test(installed), false, "no checkbox on an installed-engine row");
  assert.equal(/setAllowedEngines/.test(installed), false, "the row must not write the allowlist");
  assert.equal(/addFallbackEngine/.test(installed), false, "the row must not touch the fallback chain");
  // 白名单的外部分组仍然是那个唯一的开关。
  assert.match(client, /t\.engineEnableExternal\(enabledExternalCount, externalEngines\.length\)/);
});

check("saving a key goes through the existing credentials route", () => {
  // 扩展的 key 与内置 key 同批提交：不再有行内「保存」按钮，
  // 草稿落在 extKeyState，由底部 save() 统一写入 credentials-set。
  assert.equal(/const saveExternalKey = /.test(client), false, "the inline save path must be gone");
  assert.match(client, /for \(const \[name, draft\] of Object\.entries\(extKeyState\)\)/);
  assert.match(client, /await bridgeCredentialsSet\(name, value\)/, "reuse credentials-set, do not invent a route");
  assert.match(client, /setExtKeyState\(\{\}\)/, "drafts are cleared after a successful save");
  // 底部保存成功后要刷新扩展区的「已配置」状态点。
  assert.match(client, /void loadExtensions\(\)/, "refresh states after saving");
});

check("the input is a password field and the draft never survives a save or discard", () => {
  const at = client.indexOf("names.map((name, index) =>");
  assert.ok(at > 0, "the credential loop is missing");
  const section = client.slice(at, at + 3000);
  assert.match(section, /type: "password"/, "a credential must not render as plain text");
  // 明文只活在草稿里：保存成功清空，按「放弃」也清空。
  assert.match(client, /setExtKeyState\(\{\}\)/, "clear the draft after a successful save");
  const discardAt = client.indexOf("const discard = () => {");
  assert.ok(discardAt > 0, "discard is missing");
  assert.match(client.slice(discardAt, discardAt + 600), /setExtKeyState\(\{\}\)/, "discard must drop the drafts too");
});

check("an external key input obeys the same dirty/save contract as a built-in one", () => {
  // 这是用户提的问题：为什么只有扩展要单独的保存按钮。答案是不应该有。
  const at = client.indexOf("names.map((name, index) =>");
  const section = client.slice(at, at + 5200);
  assert.match(section, /setDirty\(true\)/, "typing a key must mark the page dirty, like a built-in key");
  assert.equal(/onClick: \(\) => saveExternalKey/.test(section), false, "no inline save button");
  assert.equal(/extKeySave|extKeySaving|extKeySaved/.test(client), false, "the inline save copy is gone");
  // 有草稿时状态点不能显示「已配置」，否则未保存会被读成已生效。
  assert.match(section, /const hasDraft = String\(state\.value \?\? ""\)\.trim\(\) !== ""/);
  assert.match(section, /const effective = hasDraft \? false : configured/);
  assert.match(section, /dshfs-priorityKeyDirty/, "an unsaved draft is shown on the field itself");
});

check("clearing a field and saving is what deletes the key", () => {
  // 用户的原话：「直接清空，保存，就行了」。空输入框以前被 `if (!value.trim()) continue`
  // 静默跳过，看起来像删了其实还在。现在空值走 unset。
  assert.match(client, /if \(trimmed === ""\) \{/, "an empty field needs its own branch");
  assert.match(client, /await bridgeCredentialsUnset\(field\)/, "emptying a field must unset the credential");
  assert.equal(/if \(!value\.trim\(\)\) continue;/.test(client), false, "the silent skip must be gone");
  // 设置页模式（keyStorage: settings）同样要能删。
  assert.match(client, /else if \(keyTouched\[field\] === true && keyWasConfigured\(field\)\) ops\.push\(\{ op: "unset", path: \[field\] \}\)/);
});

check("an untouched empty field never deletes anything", () => {
  // 服务端把 secret 值抹成空，所以「已配置」和「没配置」在输入框里长得一样。
  // 只有用户真的动过这个字段，空值才能解释成「删除」。
  assert.match(client, /const \[keyTouched, setKeyTouched\] = react\.useState\(\{\}\)/);
  assert.match(client, /keyTouched\[field\] !== true/, "the unset branch must require a touch");
  assert.match(client, /const keyWasConfigured = \(field\) =>/, "and it must also have been configured");
});

check("a saved key shows a masked preview instead of a bare placeholder", () => {
  // 凭据中心 describe() 会回同长度遮罩（sk-ab••••c4f2）。它只进 placeholder，
  // 明文永远不会被回传，也不需要额外的「显示」路由。
  assert.match(index, /masked: typeof info\?\.masked === "string"/, "the server forwards the mask");
  assert.match(index, /value: \{ configured, masked, available: true \}/);
  const loadAt = client.indexOf("const cred = await bridgeCredentialsStatus();");
  assert.ok(loadAt > 0, "the client probes the credential status");
  // 这一段里夹着一整张 key→引擎 id 的长表，所以窗口要放宽。
  const block = client.slice(loadAt, loadAt + 2600);
  assert.match(block, /cred\.value\.masked/, "the mask is read from the answer");
  assert.match(block, /setCredMasked\(mm\)/);
  assert.match(client, /const placeholder = masked \?/, "the mask replaces the placeholder");
  assert.match(client, /dshfs-priorityKeySaved/, "a stored key looks different from an unsaved draft");
});

check("the declared key is what the engine actually receives", () => {
  // 服务端把 keys 按名字交给引擎；界面里输入的名字与 runner 读的名字同源。
  const at = index.indexOf("const registerExternalEngine");
  const block = index.slice(at, at + 900);
  assert.match(block, /externalCredentialNames\(engine\)/);
  assert.match(block, /keys\[name\] = value/);
});

console.log(`OK: ${checks} extension credential checks passed`);
