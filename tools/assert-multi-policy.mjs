// #69 Phase 1（第一批）· multi 执行策略断言（零依赖离线）
//
// 对应 reporter #69 §1 / §3 的约束：
//   §1 「These are concurrency ceilings, not requirements to execute exactly that
//       many engines.」——上限是天花板，候选不够就少跑，不得凑数。
//   §3 「distinguish an optional target number of successful responses from a hard
//       minimum... should not discard valid evidence or fail solely because a
//       configured success target was not reached.」——目标成功数不是硬下限。
//   §6 兼容：默认值必须让现有行为完全不变，升级对用户透明。
import { selectEngines, planTopUp, resolveMaxEngines, resolveMinSources, describeTarget } from "../lib/multi_policy.js";

let passed = 0;
const failures = [];
const check = (name, cond) => {
  if (cond) { passed++; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name); }
};

const POOL = ["bing", "baidu", "aliyun", "anysearch"];

// ---------- A. 并发上限：默认必须等于现况（不限制） ----------
check("默认（不配置上限）→ 跑整池，与现况一致", selectEngines(POOL, undefined).join() === POOL.join());
check("上限 0 → 不限制（兼容旧配置）", selectEngines(POOL, 0).length === 4);
check("上限负数 → 不限制", selectEngines(POOL, -3).length === 4);
check("上限非数字 → 不限制", selectEngines(POOL, "abc").length === 4);
check("上限 null → 不限制", selectEngines(POOL, null).length === 4);

// ---------- B. 并发上限：天花板语义 ----------
check("上限 3 / 池 4 → 只跑 3", selectEngines(POOL, 3).length === 3);
check("上限 1 / 池 4 → 只跑 1（Fast 语义）", selectEngines(POOL, 1).join() === "bing");
check("上限 6 / 池 4 → 只跑 4，不凑数（天花板不是配额）", selectEngines(POOL, 6).length === 4);
check("上限 2 → 取池内前 2（保持用户配置的优先级顺序）", selectEngines(POOL, 2).join() === "bing,baidu");
check("上限 3 → 顺序不被重排", selectEngines(POOL, 3).join() === "bing,baidu,aliyun");
check("空池 → 空", selectEngines([], 3).length === 0);
check("池含空项 → 过滤掉", selectEngines(["bing", "", null, "baidu"], 0).join() === "bing,baidu");
check("池含空项且受上限约束 → 仍正确", selectEngines(["bing", "", null, "baidu", "ddg"], 2).join() === "bing,baidu");

// ---------- C. resolve* 边界 ----------
check("resolveMaxEngines(0, 4) = 4（不限制）", resolveMaxEngines(0, 4) === 4);
check("resolveMaxEngines(2, 4) = 2", resolveMaxEngines(2, 4) === 2);
check("resolveMaxEngines(9, 4) = 4（不超过候选数）", resolveMaxEngines(9, 4) === 4);
check("resolveMaxEngines(2.7, 4) = 2（向下取整）", resolveMaxEngines(2.7, 4) === 2);
check("resolveMinSources(undefined) = 1", resolveMinSources(undefined, 4) === 1);
check("resolveMinSources(0) = 1（0 不是合法目标）", resolveMinSources(0, 4) === 1);
check("resolveMinSources(-2) = 1", resolveMinSources(-2, 4) === 1);
check("resolveMinSources(3) = 3", resolveMinSources(3, 4) === 3);
check("resolveMinSources(NaN) = 1", resolveMinSources(Number.NaN, 4) === 1);

// ---------- D. 目标成功数不是硬下限 ----------
check("已达标 → 不补跑（不浪费额度）", planTopUp({ attempted: ["bing", "baidu"], succeeded: 2, minSources: 2, chain: ["ddg", "exa"] }).length === 0);
check("已超额 → 不补跑", planTopUp({ attempted: ["bing", "baidu", "aliyun"], succeeded: 3, minSources: 2, chain: ["ddg"] }).length === 0);
check("未达标 → 给出补跑候选", planTopUp({ attempted: ["bing"], succeeded: 1, minSources: 3, chain: ["ddg", "exa"] }).join() === "ddg,exa");
check("补跑候选排除已尝试过的", planTopUp({ attempted: ["bing", "ddg"], succeeded: 1, minSources: 3, chain: ["ddg", "exa"] }).join() === "exa");
check("补跑候选保持链路顺序", planTopUp({ attempted: ["bing"], succeeded: 0, minSources: 3, chain: ["aliyun", "anysearch", "ddg"] }).join() === "aliyun,anysearch,ddg");
check("链路已耗尽（候选都已试过）→ 无补跑（调用方据此只发提示、不发失败）",
  planTopUp({ attempted: ["bing", "baidu", "ddg", "exa"], succeeded: 1, minSources: 3, chain: ["ddg", "exa"] }).length === 0);
check("链路里还剩没试过的 → 仍给候选（此时不该说耗尽）",
  planTopUp({ attempted: ["bing", "baidu"], succeeded: 1, minSources: 3, chain: ["ddg", "exa"] }).length === 2);
check("目标为 1 且已成功 1 → 无补跑", planTopUp({ attempted: ["bing"], succeeded: 1, minSources: 1, chain: ["ddg"] }).length === 0);
check("chain 非数组 → 不抛", planTopUp({ attempted: ["bing"], succeeded: 0, minSources: 2, chain: null }).length === 0);
check("attempted 非数组 → 不抛", planTopUp({ attempted: null, succeeded: 0, minSources: 2, chain: ["ddg"] }).join() === "ddg");

// ---------- E. 未达标时的提示（告知而非失败） ----------
check("已达标 → 无提示", describeTarget({ minSources: 2, achieved: 3 }) === null);
check("恰好达标 → 无提示", describeTarget({ minSources: 2, achieved: 2 }) === null);
check("未达标 → 产出可读提示", describeTarget({ minSources: 3, achieved: 1 }) === "sourcesTarget: 3, achieved: 1");

// ---------- F. 兼容性：默认配置下行为与今天逐字一致 ----------
check("兼容：不配置任何新字段 → 上限不限制、目标 1、无补跑",
  selectEngines(POOL, undefined).length === 4
  && resolveMinSources(undefined, 4) === 1
  && planTopUp({ attempted: ["bing"], succeeded: 1, minSources: resolveMinSources(undefined, 4), chain: ["ddg", "exa"] }).length === 0);

console.log("");
if (failures.length === 0) console.log(`OK: ${passed} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
