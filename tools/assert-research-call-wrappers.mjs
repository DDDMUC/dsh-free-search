// tools/assert-research-call-wrappers.mjs — #75 回归断言：
// callEmbed / callRerank / callDecide / callJudgeQueryIntent 四个包装层曾被 9 处调用却从未定义。
// 平时被 state.rerankKey / state.decisionKey 守卫短路，配了 SILICONFLOW_RERANK_API_KEY 才炸，
// 所以要两路都钉：① 静态——每个被调用的标识符必须有定义；② 行为——真的调一遍包装层。
// 运行：node tools/assert-research-call-wrappers.mjs

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
const src = readFileSync(join(here, "..", "lib", "research.js"), "utf8");

const WRAPPERS = ["callRerank", "callEmbed", "callDecide", "callJudgeQueryIntent"];

section("A. 每个被调用的 call* 都必须有定义");
for (const w of WRAPPERS) {
  const defined = new RegExp(`(?:async\\s+)?function\\s+${w}\\b|const\\s+${w}\\s*=|export\\s+(?:async\\s+)?function\\s+${w}\\b`).test(src);
  assert(defined, `${w} 有定义`);
  const calls = (src.match(new RegExp(`\\b${w}\\s*\\(`, "g")) || []).length;
  assert(calls > 0, `${w} 确有调用点（${calls} 处），不是死代码`);
}

section("B. 包装层透传：替身优先，否则走底层实现");
const sig = (w) => (src.match(new RegExp(`async\\s+function\\s+${w}\\s*\\(([^)]*)\\)`)) || [])[1];
const stubKey = (w) => ({ callRerank: "rerank", callEmbed: "embed", callDecide: "decide", callJudgeQueryIntent: "judgeQueryIntent" })[w];
for (const w of WRAPPERS) {
  const params = (sig(w) || "").split(",").map((s) => s.trim()).filter(Boolean);
  const body = (src.match(new RegExp(`async\\s+function\\s+${w}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`)) || [])[0] || "";
  assert(params.length > 0 && params[params.length - 1] === "apiKey", `${w} 末位参数是 apiKey（实际：${params.join(", ") || "未取到"}）`);
  assert(body.includes(`CONTROLLED_STUBS.${stubKey(w)}`), `${w} 优先走 CONTROLLED_STUBS.${stubKey(w)}`);
  assert(new RegExp(`:\\s*${stubKey(w)}\\(`).test(body), `${w} 替身为空时回落到底层 ${stubKey(w)}(...)`);
}

section("C. 行为：真的调一遍包装层（无 ReferenceError）");
// 不 import lib/research.js——那会拉进宿主运行时依赖（@deepseek-ai/cordis），本仓断言一律零依赖。
// 直接从源码里取 CONTROLLED_STUBS 的字面量，再把四个包装层的函数体拿来真调一遍。
const stubLiteral = (src.match(/CONTROLLED_STUBS\s*=\s*\{[^}]*\}/) || [])[0];
assert(!!stubLiteral, "能从源码里取出 CONTROLLED_STUBS 的字面量");
const CONTROLLED_STUBS = stubLiteral ? new Function(`return ${stubLiteral.replace(/^CONTROLLED_STUBS\s*=\s*/, "")}`)() : {};

const seen = [];
CONTROLLED_STUBS.rerank = () => { seen.push("rerank"); return Promise.resolve({ scores: [0.5] }); };
CONTROLLED_STUBS.embed = () => { seen.push("embed"); return Promise.resolve([[0.1, 0.2]]); };
CONTROLLED_STUBS.decide = () => { seen.push("decide"); return Promise.resolve(["yes"]); };
CONTROLLED_STUBS.judgeQueryIntent = () => { seen.push("judge"); return Promise.resolve("intent"); };

// 包装层只用到 CONTROLLED_STUBS 与底层 rerank/embed/decide/judgeQueryIntent；
// 底层在这里用会抛的替身顶上——若包装层错误地绕过替身直连底层，这里就会炸。
const bottom = {
  rerank: () => { throw new Error("包装层没走替身，直连了底层 rerank"); },
  embed: () => { throw new Error("包装层没走替身，直连了底层 embed"); },
  decide: () => { throw new Error("包装层没走替身，直连了底层 decide"); },
  judgeQueryIntent: () => { throw new Error("包装层没走替身，直连了底层 judgeQueryIntent"); },
};

const extract = (w) => (src.match(new RegExp(`async\\s+function\\s+${w}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`)) || [])[0];
const compile = (w) => new Function("CONTROLLED_STUBS", ...Object.keys(bottom), `return (${extract(w)});`)(CONTROLLED_STUBS, ...Object.values(bottom));

let threw = null;
try {
  await compile("callRerank")("q", ["d"], "k");
  await compile("callEmbed")(["t"], "k");
  await compile("callDecide")({}, ["q"], "k");
  await compile("callJudgeQueryIntent")("q", "k");
} catch (e) {
  threw = e;
}
assert(threw === null, `四个包装层都能被调用而不抛 ReferenceError${threw ? "（" + threw.message + "）" : ""}`);
assert(["rerank", "embed", "decide", "judge"].every((k) => seen.includes(k)), `四次调用全部命中替身（实际：${seen.join(", ") || "无"}）`);

console.log("");
if (failures.length === 0) console.log(`OK: ${pass} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}