// 两处修复的回归断言：
//   1. 卸载成功后不能留下 stage:"done" 的 installJobs —— 那个文案在「可安装」行里
//      会显示成「已安装」，用户看到的是「卸了但还写着已安装」。
//   2. node_modules 里的悬空符号链接（目标目录已被删）不是引擎包，不能进 failures，
//      否则扩展区会一直挂一条与搜索引擎无关的「加载失败」。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadExternalEngine } from "../lib/external_engines.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

check("a successful uninstall drops the job instead of leaving it done", () => {
  const at = client.indexOf("const removeExtension = async (packageName) => {");
  assert.ok(at > 0, "removeExtension is missing");
  const block = client.slice(at, at + 1400);
  // 卸载成功不能写 stage:"done"：t.extInstallDone 是「已安装，正在重新加载引擎…」
  assert.equal(/stage: "done"/.test(block), false, "uninstall must not reuse the install 'done' stage");
  assert.match(block, /delete next\[packageName\]/, "the job must be dropped on success");
});

check("a dangling symlink is skipped, not reported as a failure", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dshfs-dangling-"));
  const dir = path.join(root, "node_modules", "@local", "dsh-preset-gone");
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  // 建一个指向不存在目录的链接
  try {
    fs.symlinkSync(path.join(root, "does-not-exist"), dir, "dir");
  } catch {
    // Windows 无权限建符号链接时，这条断言退化为「目录不存在」的等价场景
    // （existsSync 同样为 false），语义不变。
  }

  const result = await loadExternalEngine("@local/dsh-preset-gone", dir, [], new Set());
  assert.equal(result?.skipped, true, "a package directory that does not exist must be skipped");
  assert.equal(result?.failure, undefined, "it must not be reported as a failure");

  fs.rmSync(root, { recursive: true, force: true });
});

console.log(`OK: ${checks} extension state checks passed`);
