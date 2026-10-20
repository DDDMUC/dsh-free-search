// #69 Phase 1（第一批）· multi 执行策略断言（零依赖离线）
//
// 对应 reporter #69 §1 / §3 的约束：
//   §1 「These are concurrency ceilings, not requirements to execute exactly that
//       many engines.」——上限是天花板，候选不够就少跑，不得凑数。
//   §3 「distinguish an optional target number of successful responses from a hard
//       minimum... should not discard valid evidence or fail solely because a
//       configured success target was not reached.」——目标成功数不是硬下限。
//   §6 兼容：默认值必须让现有行为完全不变，升级对用户透明。
import { selectEngines, planTopUp, resolveMaxEngines, resolveMinSources, describeTarget, REQUIRED_CREDENTIALS, credentialRequirement, isCredentialEligible, partitionByCredentials, MULTI_PRESETS, presetForSettings } from "../lib/multi_policy.js";

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

// ---------- G. 凭据资格：#69 §2「Missing credentials」必须在选上限之前滤掉 ----------
// 起因：multi 池默认 zh: [bing, baidu, aliyun, anysearch]。本机 baidu/aliyun 无 key，
// 但它们要到 runEngineTest 才发现 not configured —— 那时已经占掉了并发上限的名额。
// 上限设 3 时取走的正是这三个不可用的，唯一能跑的 anysearch 被切掉 → 整次 multi 失败。
const noneAvailable = () => false;
const allAvailable = () => true;

for (const keyless of ["ddg", "ddg-lite", "bing", "searxng"]) {
  check(`免 key 引擎 ${keyless} 永不被凭据过滤`, isCredentialEligible(keyless, noneAvailable));
}
for (const fallback of ["anysearch", "exa", "parallel"]) {
  check(`有免 key 兜底的 ${fallback} 缺 key 也算合格`, isCredentialEligible(fallback, noneAvailable));
}
for (const engine of Object.keys(REQUIRED_CREDENTIALS)) {
  check(`${engine} 缺 key → 不合格`, !isCredentialEligible(engine, noneAvailable));
  check(`${engine} 有 key → 合格`, isCredentialEligible(engine, allAvailable));
  const descs = credentialRequirement(engine);
  check(`${engine} 的凭据描述符带 env 与 settings 两项`,
    Array.isArray(descs) && descs.length > 0
    && descs.every((d) => typeof d.env === "string" && d.env && (typeof d.settings === "string" || d.settings === null)));
}
check("credentialRequirement 返回副本（外部改动不污染清单）",
  (() => { const a = credentialRequirement("baidu"); a.push({ env: "X", settings: null }); return credentialRequirement("baidu").length === 1; })());
check("免 key 引擎的 credentialRequirement 为 null", credentialRequirement("bing") === null);

// 池子实测：正是出问题那一幕
{
  const pool = ["bing", "baidu", "aliyun", "anysearch"];
  const onlyThese = (...ok) => (engine) => ok.includes(engine);
  const { eligible, missing } = partitionByCredentials(pool, onlyThese("bing", "anysearch"));
  check("出问题那一幕：bing/anysearch 通过凭据资格（无 key 也能跑）", eligible.join() === "bing,anysearch");
  check("被滤掉的正是 baidu/aliyun（占名额的元凶）", missing.join() === "baidu,aliyun");
  check("滤完再套上限 3，唯一可用引擎 anysearch 不再被切掉",
    selectEngines(eligible, 3).includes("anysearch"));
  check("滤完再套上限 1，退化成 Fast 语义", selectEngines(eligible, 1).join() === "bing");
  check("上限 0（默认）时仍跑满合格集，行为不变", selectEngines(eligible, 0).length === 2);
  check("全有 key 时滤不掉任何引擎", partitionByCredentials(pool, allAvailable).missing.length === 0);
  check("全没 key 时只留免 key/兜底引擎",
    partitionByCredentials(pool, noneAvailable).eligible.join() === "bing,anysearch");
  check("eligible+missing 覆盖全池且不改顺序",
    partitionByCredentials(pool, onlyThese("baidu")).eligible.join() === "bing,baidu,anysearch");
}

check("分区：空输入不抛", partitionByCredentials([], noneAvailable).eligible.length === 0);
check("分区：非数组不抛", partitionByCredentials(undefined, noneAvailable).missing.length === 0);
check("未知引擎不抛且算合格（宁放过不误杀）", isCredentialEligible("some-future-engine", noneAvailable));

// 交叉校验（防漂移）：清单必须与 index.js 里 runEngineTest 的 "not configured" 分支一一对应
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, "..", "lib", "index.js"), "utf8");

  for (const [engine, descs] of Object.entries(REQUIRED_CREDENTIALS)) {
    // 每个描述符的 env 名都必须能在 index.js 里找到对应的 "not configured" 或 resolver 用法
    const declared = descs.some((d) => src.includes(`${d.env} not configured`));
    check(`交叉校验：${engine} 的 ${descs[0].env} 在 index.js 里确实有 "not configured" 声明`, declared);
  }
  for (const engine of ["ddg", "ddg-lite", "bing", "searxng", "anysearch", "exa", "parallel", "you"]) {
    check(`交叉校验：${engine} 未被误列入必需凭据清单`, !(engine in REQUIRED_CREDENTIALS));
  }
  check("交叉校验：settings 名与 index.js 的 config 字段对应",
    Object.values(REQUIRED_CREDENTIALS).flat().every((d) => d.settings === null || src.includes(d.settings)));
}
check("兼容：不配置任何新字段 → 上限不限制、目标 1、无补跑",
  selectEngines(POOL, undefined).length === 4
  && resolveMinSources(undefined, 4) === 1
  && planTopUp({ attempted: ["bing"], succeeded: 1, minSources: resolveMinSources(undefined, 4), chain: ["ddg", "exa"] }).length === 0);

// ---------- G. 执行档位（#69 §1：只复用现有两个旋钮，零后端新增） ----------
check("fast = 1 并发 / 1 目标", presetForSettings(1, 1) === "fast");
check("balanced = 3 并发 / 1 目标", presetForSettings(3, 1) === "balanced");
check("deep = 6 并发 / 2 目标", presetForSettings(6, 2) === "deep");
check("默认 0/1 不属于任何档位 → 自定义（升级无感）", presetForSettings(0, 1) === "custom");
check("默认 undefined → 自定义", presetForSettings(undefined, undefined) === "custom");
check("改一个数字即回自定义", presetForSettings(4, 2) === "custom" && presetForSettings(3, 2) === "custom");
check("档位值本身合法（上限为正或 0、目标 ≥1）",
  Object.values(MULTI_PRESETS).every((p) => p.maxEngines > 0 && p.minSources >= 1));
check("档位上限与 reporter 的 1/3/6 一致",
  MULTI_PRESETS.fast.maxEngines === 1 && MULTI_PRESETS.balanced.maxEngines === 3 && MULTI_PRESETS.deep.maxEngines === 6);
check("档位能驱动既有两个旋钮（selectEngines / resolveMinSources 不报错）",
  selectEngines(POOL, MULTI_PRESETS.fast.maxEngines).length === 1
  && resolveMinSources(MULTI_PRESETS.deep.minSources, 4) === 2);
check("每个档位的 (上限,目标) 都能反推回自己（往返一致）",
  Object.entries(MULTI_PRESETS).every(([id, p]) => presetForSettings(p.maxEngines, p.minSources) === id));
// 交叉校验：client.js 无 import，内联了一份档位表——两份必须一致（否则 UI 点出来的值后端不认）
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const pathMod = await import("node:path");
  const here = pathMod.dirname(fileURLToPath(import.meta.url));
  const clientSrc = readFileSync(pathMod.join(here, "..", "lib", "client.js"), "utf8");
  const m = clientSrc.match(/MULTI_PRESET_VALUES\s*=\s*\{([\s\S]*?)\n\s*\};/);
  check("交叉校验：client.js 内联档位表存在", Boolean(m));
  if (m) {
    for (const [id, p] of Object.entries(MULTI_PRESETS)) {
      const re = new RegExp(`${id}\\s*:\\s*\\{\\s*maxEngines:\\s*${p.maxEngines}\\s*,\\s*minSources:\\s*${p.minSources}\\s*\\}`);
      check(`交叉校验：client.js 的 ${id} 与后端一致（${p.maxEngines}/${p.minSources}）`, re.test(m[1]));
    }
  }
}

console.log("");
if (failures.length === 0) console.log(`OK: ${passed} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
