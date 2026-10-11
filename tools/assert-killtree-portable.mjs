// tools/assert-killtree-portable.mjs — #74 回归断言：浏览器子进程树销毁不得在非 Windows 平台
// 产生 uncaughtException（那会直接带走 dsh 宿主），且必须真的把整组杀掉。
// 运行：node tools/assert-killtree-portable.mjs
//
// 做法：把 lib/fetch_provider.js 的 killTree 形状原样搬进来（该函数未导出），用真实的
// detached 子进程组当替身；再静态校验线上文件里平台判断与 on("error") 监听确实存在，
// 防止将来重构时把修复悄悄改回去。

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let pass = 0;
const failures = [];
const assert = (cond, name) => {
  if (cond) { pass += 1; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name); }
};
const section = (t) => console.log("\n== " + t + " ==");

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "lib", "fetch_provider.js"), "utf8");

section("A. 线上代码：平台判断 + 异步错误监听");
assert(/process\.platform\s*!==\s*"win32"[\s\S]{0,400}process\.kill\(-child\.pid/.test(src),
  "非 win32 分支走 process.kill(-pid) 进程组，不再碰 taskkill");
assert(/spawn\("taskkill"[\s\S]{0,200}on\(\s*"error"/.test(src),
  "taskkill 的 spawn 挂了 on(\"error\")（异步 ENOENT 不会再升级成 uncaughtException）");
assert(/killer\.unref\(\)/.test(src), "taskkill 已 unref（不留事件循环活口）");
assert(/detached:\s*process\.platform\s*!==\s*"win32"/.test(src),
  "浏览器在 POSIX 下以 detached 独立进程组启动（整组杀的前提）");

section("B. 行为：killTree 在本机不产生 uncaughtException");
const uncaught = [];
const prevHandler = process.listeners("uncaughtException");
process.removeAllListeners("uncaughtException");
process.on("uncaughtException", (e) => { uncaught.push(e); });

const lib = src.match(/const killTree = \(\) => \{[\s\S]*?\n    \};/);
assert(!!lib, "能从线上文件里抠出 killTree（形状未变）");

// 用真实 detached 子进程组当替身：组内含两个 sleep，模拟浏览器 + 渲染子进程
function spawnTree() {
  const child = spawn("/bin/sh", ["-c", "sleep 30 & sleep 30 & wait"], {
    stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}
const pidsAlive = (pids) => pids.filter((p) => { try { process.kill(p, 0); return true; } catch { return false; } });

if (process.platform !== "win32") {
  const child = spawnTree();
  const killer = new Function("child", "spawn", "process", lib[0] + "; return killTree;")(
    child, spawn, process,
  );
  await new Promise((r) => setTimeout(r, 300)); // 等 sh 拉起两个 sleep
  const group = [];
  try {
    // 组内除自己之外的所有 pid（sh 与两个 sleep）
    const { execSync } = await import("node:child_process");
    const out = execSync(`ps -o pid= -g ${child.pid} 2>/dev/null || true`).toString().trim();
    group.push(...out.split(/\s+/).filter(Boolean).map(Number));
  } catch { /* ps -g 不可用则只校验主进程 */ }
  assert(group.length >= 1, `起出可观测的进程组（成员 ${group.length} 个）`);

  killer(); // 这就是 lib/fetch_provider.js 里的 killTree()
  await new Promise((r) => setTimeout(r, 400));

  assert(uncaught.length === 0,
    `killTree 未触发 uncaughtException（${uncaught.length ? uncaught.map((e) => e.code).join(",") : "0 个"}）`);
  assert(pidsAlive(group).length === 0,
    `整组被杀干净（残留 ${pidsAlive(group).length} 个：${pidsAlive(group).join(",") || "无"}）`);
} else {
  console.log("  skip  行为段（win32 上无法验证 POSIX 进程组）");
}

process.removeAllListeners("uncaughtException");
for (const h of prevHandler) process.on("uncaughtException", h);

console.log("");
if (failures.length === 0) console.log(`OK: ${pass} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}