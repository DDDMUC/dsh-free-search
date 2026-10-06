// tools/assert-vertical.mjs — domain_search 工具与引擎注册表的断言（无 key、受控网络除外）。
// 运行：node tools/assert-vertical.mjs（离线部分）；node tools/assert-vertical.mjs --live 追加 3 个免 key 真跑
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const assert = (cond, name) => {
  if (cond) { pass += 1; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name); }
};
const section = (t) => console.log("\n== " + t + " ==");

section("A. 注册表与工具形态（离线）");
const { ENGINES, registerDomainSearchTool } = await import("../lib/vertical.js");
const keys = Object.keys(ENGINES);
assert(keys.length === 37, `引擎注册表共 37 个（实际 ${keys.length}）`);
assert(typeof registerDomainSearchTool === "function", "registerDomainSearchTool 可导入（模块无网络副作用）");
assert(keys.every((k) => typeof ENGINES[k].run === "function" && typeof ENGINES[k].desc === "string" && ENGINES[k].desc), "每个引擎都有 run() 与非空 desc");
const dupDesc = keys.map((k) => ENGINES[k].desc).filter((d, i, a) => a.indexOf(d) !== i);
assert(dupDesc.length === 0, "desc 无重复（agent 可区分）");
// 依赖面：vertical.js 不 import research.js
const { readFileSync } = await import("node:fs");
const vsrc = readFileSync(new URL("../lib/vertical.js", import.meta.url), "utf8");
assert(!/from "\.\/research\.js"/.test(vsrc), "vertical.js 不依赖 research.js（fetch_upstream 同源取 httpsJson/htmlToText）");

section("B. 工具注册与错误路径（受控 ctx，零网络）");
let registered = null;
const fakeCtx = { inject: (_slots, fn) => fn({ effect: (f) => f(), tools: { register: (t) => { registered = t; return () => {}; } } }) };
registerDomainSearchTool(fakeCtx, { wrapUntrustedBlock: (s) => `<u>${s}</u>` });
assert(registered && registered.name === "domain_search", "domain_search 工具注册成功");
const badEngine = await registered.execute({ engine: "nope", query: "x" });
assert(badEngine.error && badEngine.error.includes("unknown engine"), "未知引擎返回 error（不抛异常）");
const renderBad = registered.output.render({}, badEngine);
assert(renderBad[0].text.includes("failed") && renderBad[0].text.includes("domain_search"), "render 失败路径带 engine 名");

if (process.argv.includes("--live")) {
  section("C. 免 key 真跑（3 引擎抽测）");
  for (const [engine, query] of [["pypi", "react"], ["worldclock", "北京"], ["crates", "serde"]]) {
    try {
      const r = await registered.execute({ engine, query });
      assert(!r.error && r.sources.length > 0, `${engine} "${query}" 返回 ${r.sources.length} 条（真跑）`);
    } catch (e) { assert(false, `${engine} "${query}" 抛异常: ${e.message.slice(0, 60)}`); }
  }
}

console.log("");
if (failures.length === 0) console.log(`OK: ${pass} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
