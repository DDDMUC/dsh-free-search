// 扩展行状态的第三条规则：装成功也不能留 stage:"done"。
// 「已安装」行把 done 渲染成 extRemoveDone（「已卸载，正在重新加载引擎…」），
// 「可安装」行把 done 渲染成 extInstallDone。同一条记录在两个区里的含义相反，
// 所以两个成功分支都必须把它清掉。
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

const blockOf = (needle, len) => {
  const at = client.indexOf(needle);
  assert.ok(at > 0, `${needle} is missing`);
  return client.slice(at, at + len);
};

check("a successful install drops the job instead of leaving it done", () => {
  const block = blockOf("const installExtension = async (packageName) => {", 2000);
  assert.equal(/stage: "done"/.test(block), false,
    "a finished install must not leave a done job for the installed row");
  assert.match(block, /delete next\[packageName\]/, "the job must be dropped on success");
});

check("a successful uninstall drops the job too", () => {
  const block = blockOf("const removeExtension = async (packageName) => {", 1400);
  assert.equal(/stage: "done"/.test(block), false);
  assert.match(block, /delete next\[packageName\]/);
});

check("both rows would read a done job with opposite meaning", () => {
  // 这条断言说明为什么必须清掉，而不是换文案：
  // 「可安装」行 done -> extInstallDone（已安装）
  // 「已安装」行 done -> extRemoveDone（已卸载）
  const installed = blockOf("const removeNote = !removeJob", 1400);
  assert.match(installed, /removeJob\.stage === "done"[\s\S]{0,600}extRemoveDone/,
    "the installed row renders done as 'removed'");
});

console.log(`OK: ${checks} extension state checks passed`);
