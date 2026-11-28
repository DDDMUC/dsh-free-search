// 已存过的 key 应该像大部分软件那样「直接显示在输入框里」：遮罩是输入框的值，
// 聚焦 / 单击即全选，清空再按底部「保存」就是删除。
//
// 这里钉住三件事：
//   1) 遮罩进 value，不进 placeholder；
//   2) 遮罩是可编辑的值，所以输入里出现的遮罩字符必须被剥掉（否则会把遮罩的
//      可见前缀当成用户打的内容存进凭据中心）；
//   3) 「动过」的状态必须能传达到状态点和保存判定，否则删空之后框会自己填回去、
//      或者保存时把没动过的空框读成删除。
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

const stateBlock = () => {
  // 从遮罩字符常量开始切：KEY_MASK_CHAR 定义在 keyInputState 之前。
  const at = client.indexOf("const KEY_MASK_CHAR");
  assert.ok(at > 0, "the key mask constants are missing");
  return client.slice(at, at + 2600);
};

check("the mask is the field's value, not its placeholder", () => {
  const block = stateBlock();
  assert.match(block, /value: showingStored \? mask : text/, "the stored mask fills the field");
  assert.equal(/placeholder: ?masked/.test(client), false, "the mask must not be a placeholder");
  // 画遮罩时用 text：遮罩本身已经是点，再套 password 会把尾部可见字符吃掉。
  assert.match(block, /type: showingStored \? "text" : "password"/);
  assert.match(block, /showingStored = touched !== true && text === "" && configured === true && mask !== ""/);
});

check("touching the field replaces the mask instead of appending to it", () => {
  const block = stateBlock();
  // 聚焦和单击都全选：否则把光标点进遮罩中间，前面的 "sk-ab" 会被当作用户输入。
  assert.match(block, /onFocus: \(event\) => \{ if \(showingStored\) event\.target\.select\(\); \}/);
  assert.match(block, /onMouseDown: \(event\) => \{/);
  assert.match(block, /event\.target\.select\(\)/);
  // 没先全选就直接打字时，输入是「遮罩 + 新打的字」；先剥遮罩再给草稿。
  assert.match(block, /if \(showingStored && value !== mask\)/);
  assert.match(block, /value\.startsWith\(mask\)/);
  assert.match(block, /value\.endsWith\(mask\)/);
  // 遮罩字符永远不属于 key：宿主只接受可打印 ASCII。
  assert.match(block, /const KEY_MASK_CHAR = \/\\u2022\/g;/);
  assert.match(block, /onDraft\(value\.replace\(KEY_MASK_CHAR, ""\)\)/);
});

check("all four key entry points use the same view", () => {
  // 回退链行内（多 key textarea）、模型内置搜索、扩展区、设置面板的密码字段。
  assert.match(client, /const renderEngineKeyInput = \(id\) => \{/);
  const uses = (client.match(/keyInputState\(\{/g) ?? []).length;
  assert.ok(uses >= 4, `keyInputState must be used by every entry point (found ${uses})`);
  for (const call of client.match(/keyInputState\(\{[\s\S]{0,900}?\}\)/g) ?? []) {
    assert.match(call, /touched:/, "every call must report whether the field was touched");
  }
  // 设置面板的密码字段（deepseek-tools / deepseek-fetch）也走同一条路径。
  assert.match(client, /const isSecret = options\.type === "password"/);
  assert.match(client, /className: "dshfs-priorityKey" \+ \(view\.showingStored/);
});

check("a key supplied by the environment is not drawn as a stored key", () => {
  // 回落遮罩只在「key 存在设置页」时启用。环境变量里的 key 没有遮罩，
  // 画成「本插件存下来的这把」会让「清空 + 保存」看起来毫无反应。
  const block = stateBlock();
  assert.match(block, /maskFallback && configured === true && touched !== true/);
  assert.match(client, /maskFallback: keyStorage === "settings"/);
});

check("clearing the field is visible before saving", () => {
  const at = client.indexOf("names.map((name, index) =>");
  assert.ok(at > 0, "the external key loop is missing");
  const section = client.slice(at, at + 6000);
  assert.match(section, /const touched = state\.value !== undefined/);
  assert.match(section, /const effective = touched \? false : configured/);
  // 动过（含清空）就描边，表示这次保存会删掉它。
  assert.match(section, /touched \? " dshfs-priorityKeyDirty"/);
});

check("saving and discarding both drop the touched marks", () => {
  // 不清的话：保存后再按一次保存，没改过的空框会被读成删除；
  // 而且清空状态下输入框不会重新画出刚存进去那把 key 的遮罩。
  const saveOk = client.indexOf("// 草稿已落盘");
  assert.ok(saveOk > 0, "the save-success branch is missing");
  assert.match(client.slice(saveOk, saveOk + 700), /setKeyTouched\(\{\}\)/);
  const discardAt = client.indexOf("const discard = () => {");
  assert.ok(discardAt > 0, "discard is missing");
  assert.match(client.slice(discardAt, discardAt + 700), /setKeyTouched\(\{\}\)/);
});

check("the built-in status dot follows the draft as well", () => {
  assert.match(client, /if \(field && keyTouched\[field\] === true\) return false;/,
    "a touched field must not keep the green dot");
});

check("the server hands out masks per credential name", () => {
  // credentials.describe() 的同长度预览，一次就够：既回答「配没配」，也给遮罩。
  assert.match(index, /async credentialsStatus\(\)/);
  assert.match(index, /masked: typeof info\?\.masked === "string" && info\.masked !== ""/);
  assert.match(index, /return \{ ok: true, value: \{ configured, masked, available: true \} \}/);
  // 外部引擎的凭据名由包自己声明，走 extensions() 回传。
  assert.match(index, /const extKeyMasked = \{\};/);
  assert.match(index, /keysMasked: extKeyMasked/);
  assert.match(index, /credentialsSvc\.describe\(name\)/);
  // 分不得清的两个 DeepSeek key：按字段名，不按引擎 id。
  assert.match(client, /const \[credByField, setCredByField\]/);
  assert.match(client, /const keyMaskFor = \(field\) => \{/);
});

console.log(`OK: ${checks} key mask field checks passed`);
