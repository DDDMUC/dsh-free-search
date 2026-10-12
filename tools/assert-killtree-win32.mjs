// tools/assert-killtree-win32.mjs — #74 的 win32 行为断言（补 assert-killtree-portable.mjs 的空缺）
//
// 分工：`assert-killtree-portable.mjs` 覆盖结构约束 + POSIX 进程组行为，但它的行为段在
// Windows 上是 `skip` —— 于是 win32 分支那条真正调用 `taskkill /pid <pid> /T /F` 的路径
// 长期以来没有任何行为验证。本文件补这一块，并且跨平台锁定 #74 的根因机制。
//
// 关键做法（与 portable 版一致）：`killTree` 是 `browserDumpDom` 里的局部闭包、未导出，
// 所以这里用正则从**线上文件**里把它的源码抠出来，用 `new Function` 注入 child/spawn/process
// 后调用。测的是仓库里真实的代码形状，不是抄一份副本——将来重构改坏了形状，这里会红。
//
// 运行：node tools/assert-killtree-win32.mjs
import { spawn, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "lib", "fetch_provider.js"), "utf8");

let pass = 0;
const failures = [];
const assert = (cond, name) => {
  if (cond) { pass += 1; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 全程盯住 uncaughtException：#74 的宿主暴毙就是以这个形式出现的
const uncaught = [];
const prevHandlers = process.listeners("uncaughtException");
process.removeAllListeners("uncaughtException");
process.on("uncaughtException", (e) => uncaught.push(e));

const isWin = process.platform === "win32";
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// ---- 前置：从线上文件抠出 killTree ----
// 这条「能抠出 killTree」portable 版已经断言过（它的 B1），这里不重复计数；
// 但抠不到必须硬失败退出——否则本文件会一条不跑还打印 "OK: 0 assertions passed"，
// 那是假绿（LESSONS 第 3 条：断言必须能红，不能空转）。
// 与 portable 版同一条正则：killTree 结束于 4 空格缩进的 `};`
const extracted = src.match(/const killTree = \(\) => \{[\s\S]*?\n    \};/);
if (!extracted) {
  process.removeAllListeners("uncaughtException");
  for (const h of prevHandlers) process.on("uncaughtException", h);
  console.error("FAIL: 无法从 lib/fetch_provider.js 抠出 killTree 源码（函数形状被重构改坏；请同步更新本文件的正则）");
  process.exit(1);
}

{
  const makeKillTree = (child, injectedSpawn = spawn, injectedProcess = process) =>
    new Function("child", "spawn", "process", extracted[0] + "; return killTree;")(
      child, injectedSpawn, injectedProcess,
    );

  // ---- 2. win32 行为：真实进程树被 taskkill /T 杀干净 ----
  if (isWin) {
    // 父进程再拉一个 detached 子进程，模拟「浏览器主进程 + 渲染子进程」
    const marker = "GRANDCHILD_PID=";
    const parent = spawn(process.execPath, ["-e",
      `const {spawn}=require('child_process');` +
      `const g=spawn(process.execPath,['-e','setTimeout(()=>{},60000)'],{stdio:'ignore',detached:true});` +
      `console.log('${marker}'+g.pid);` +
      `setTimeout(()=>{},60000);`
    ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

    let grandPid = null;
    parent.stdout.on("data", (c) => {
      const m = String(c).match(new RegExp(marker + "(\\d+)"));
      if (m) grandPid = Number(m[1]);
    });
    // 等父进程把子进程拉起来并报出 pid
    for (let i = 0; i < 40 && grandPid === null; i++) await sleep(100);
    assert(grandPid !== null, "win32：被测父子进程树已就绪（拿到孙进程 pid）");
    assert(pidAlive(parent.pid) && pidAlive(grandPid), "win32：调用前父子进程都活着（否则测试无效）");

    makeKillTree(parent)();
    // taskkill 异步结束，留时间
    for (let i = 0; i < 30 && (pidAlive(parent.pid) || pidAlive(grandPid)); i++) await sleep(100);

    assert(!pidAlive(parent.pid), `win32：主进程已被 taskkill 杀死`);
    assert(!pidAlive(grandPid), `win32：孙进程（渲染子进程替身）也被杀干净 —— /T 树杀生效`);
    assert(uncaught.length === 0,
      `win32：killTree 全程无 uncaughtException（#74 的宿主暴毙形式）${uncaught.length ? "，实际: " + uncaught.map((e) => e.code).join(",") : ""}`);
    try { parent.kill("SIGKILL"); } catch { /* 已死 */ }

    // ---- 3. 降级：taskkill 本身失败（目标 pid 不存在）时宿主必须存活 ----
    const before = uncaught.length;
    const dummy = { pid: 999999999, kill() { return true; } };
    makeKillTree(dummy)();
    await sleep(1200);
    assert(uncaught.length === before, "win32：taskkill 找不到目标 pid（必然失败）也不抛 uncaughtException");
  } else {
    console.log("  skip  win32 行为段（本机非 win32，taskkill 分支无法执行；交由 Windows 端 CI/人工跑）");
  }

  // ---- 4. 跨平台锁定 #74 根因：ENOENT 是异步 'error' 事件，不挂监听器就会掀翻宿主 ----
  {
    const probe = "dshfs-assert-nonexistent-killer-probe";
    let caught = null;
    const k = spawn(probe, ["/pid", "1"], { stdio: "ignore" });
    k.on("error", (e) => { caught = e; });
    k.unref();
    await sleep(600);
    assert(caught !== null && caught.code === "ENOENT",
      "机制：不存在的命令确实以异步 'error' 事件送达 ENOENT（同步 try/catch 抓不到）");
    assert(uncaught.length === 0, "机制：挂上 on(\"error\") 后 ENOENT 被接住，宿主进程存活");
  }
}

process.removeAllListeners("uncaughtException");
for (const h of prevHandlers) process.on("uncaughtException", h);

console.log("");
if (failures.length === 0) console.log(`OK: ${pass} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
