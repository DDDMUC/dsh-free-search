// tools/assert-research-degradation.mjs — #59 评审四问的断言。
// ① 无 key 完全降级  ② node:sqlite 降级  ④ 缓存路径可配置
// ③ 90s 预算只作用于 research 自身（不波及 web_search）——由常量与独立 AbortController 静态验证。
// 运行：node tools/assert-research-degradation.mjs
import { readFileSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const assert = (cond, name) => {
  if (cond) { pass += 1; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name); }
};
const section = (t) => console.log("\n== " + t + " ==");

// ---------- ① 无 key 降级 ----------
section("① 无 key 完全降级");
// 清掉所有相关 key，确保走规则版
const KEYS = ["SILICONFLOW_RERANK_API_KEY", "DECISION_MODEL_API_KEY", "DECISION_MODEL_URL", "EXA_API_KEY", "FIRECRAWL_API_KEY", "CRAWL4AI_API_KEY"];
for (const k of KEYS) delete process.env[k];
const { decide, rerank, embed } = await import("../lib/rerank.js");
assert((await decide({}, [], undefined)) === null, "decide() 无端点/无 key 起始返回 null（调用方走规则回退）");
assert((await rerank("q", ["a"], undefined)) === null, "rerank() 无 key 返回 null（失败软降级）");
assert((await embed(["a"], undefined)) === null, "embed() 无 key 返回 null（失败软降级）");

const { registerResearchTool } = await import("../lib/research.js");
assert(typeof registerResearchTool === "function", "research 工具可注册（无 key 时模块仍可加载，不抛）");

// ---------- ② node:sqlite 降级 ----------
section("② node:sqlite 降级（整体 no-op）");
// 本机 Node 版本决定 sqlite 是否可用；两种情况都必须不抛。
const cache = await import("../lib/cache.js");
assert(typeof cache.getFresh === "function" && typeof cache.put === "function" && typeof cache.search === "function", "cache 三接口均在（无 sqlite 时为早退空实现）");
assert(cache.getFresh("https://example.com", 1000) === null, "getFresh() 返回 null（不抛）");
assert(Array.isArray(cache.search("anything")) && cache.search("anything").length === 0 || Array.isArray(cache.search("anything")), "search() 返回数组（不抛）");
cache.put("https://example.com", "t", "c"); // 不抛即可
assert(true, "put() 调用不抛（缓存不可用时静默 no-op）");

// ---------- ③ 90s 预算隔离 ----------
section("③ 90 秒预算只作用于 research");
const researchSrc = readFileSync(new URL("../lib/research.js", import.meta.url), "utf8");
assert(/export const DEADLINE_MS = 90_000/.test(researchSrc), "DEADLINE_MS = 90_000（research 自己的共享预算）");
assert(/new AbortController\(\)/.test(researchSrc), "research 持有独立 AbortController（不共用搜索路径的 signal）");
const indexSrc = readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
assert(!/DEADLINE_MS/.test(indexSrc), "index.js 不引用 DEADLINE_MS（普通搜索路径 30s 预算不受影响）");

// ---------- ④ 缓存路径可配置 ----------
section("④ 缓存路径可配置");
const cacheSrc = readFileSync(new URL("../lib/cache.js", import.meta.url), "utf8");
assert(/process\.env\.RESEARCH_CACHE_DIR/.test(cacheSrc), "cache.js 读取 RESEARCH_CACHE_DIR");
// 真跑一次：指向临时目录，确认 db 建在那
const tmp = "D:/维护/.tmp-research-cache-test";
rmSync(tmp, { recursive: true, force: true });
const out = execFileSync(process.execPath, ["-e", `
process.env.RESEARCH_CACHE_DIR = ${JSON.stringify(tmp)};
await import(${JSON.stringify(new URL("../lib/cache.js", import.meta.url).href)});
await new Promise(r => setTimeout(r, 150));
`], { encoding: "utf8", env: { ...process.env, RESEARCH_CACHE_DIR: tmp } });
const dbThere = existsSync(`${tmp}/research.db`);
assert(dbThere, `RESEARCH_CACHE_DIR 生效：research.db 建在指定目录（本机 Node 支持 node:sqlite 时）`);
if (!dbThere) console.log("      （若本机 Node <22.5，无 node:sqlite 属预期 no-op，此项会 FAIL——请按环境判读）");
rmSync(tmp, { recursive: true, force: true });

console.log("");
if (failures.length === 0) console.log(`OK: ${pass} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
