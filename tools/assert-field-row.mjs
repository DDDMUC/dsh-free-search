// 界面语言字段的排布回归：它必须与「密钥存储」一致 —— 单行（标题 + 下拉同一行），
// 而不是「标题一行、下拉独占一行」的两行形态。
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

check("界面语言用 fieldRow，而不是独占一列的 field", () => {
  const at = client.indexOf("t.uiLangLabel");
  assert.ok(at > 0, "uiLang label is missing");
  // 往上 400 字符内应当是 fieldRow，不能是 dshfs-field
  const before = client.slice(Math.max(0, at - 400), at);
  const containerClass = [...before.matchAll(/className: "dshfs-(fieldRow|field)"/g)].pop()?.[1];
  assert.equal(containerClass, "fieldRow", `uiLang sits in dshfs-${containerClass}`);
});

check("下拉在单行里的宽度不再撑满整行", () => {
  // 全宽是 .dshfs-dd 的默认值；单行场景必须给它一个上限，否则它自己占满一行。
  assert.match(client, /\.dshfs-fieldRow>\.dshfs-dd\{width:auto;flex:0 1 220px;min-width:140px\}/);
});

check("密钥存储仍是单行，两处一致", () => {
  const at = client.indexOf("t.keyStorage");
  const before = client.slice(Math.max(0, at - 400), at);
  assert.ok(before.includes('className: "dshfs-fieldRow"'), "keyStorage uses fieldRow");
});

console.log(`OK: ${checks} one-row layout checks passed`);
