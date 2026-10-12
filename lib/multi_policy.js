// #69 Phase 1（第一批）：multi 模式的执行策略——纯函数，便于离线断言。
//
// 为什么单独成文件：这几个判断（并发上限怎么取、目标成功数怎么补跑）跑在
// runMultiSearch 里，而那是 apply() 内的闭包、无法导出单测。抽成纯函数后
// 既可以直接断言，也符合 reporter「三个预设共用同一条执行管线」的方向
// （将来加 Fast/Balanced/Deep 时，这里就是预设唯一的作用点）。
//
// 两条约束来自 reporter #69，都有断言钉住：
//   §1 并发上限是「天花板」不是「必须跑满」——候选不够就少跑，不得凑数。
//   §3 目标成功数（minSources）是「尽量达到」而非硬下限——达不到时返回已有
//      结果并附提示，绝不丢弃有效证据、绝不因此让整次搜索失败。
// 另有兼容硬约束：默认值必须让现有行为完全不变，升级对用户透明。

/** 0 / 非数字 / 负数 一律视为「不限制」，保证未配置时行为与今天一致。 */
export function resolveMaxEngines(value, poolSize) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return poolSize;
  return Math.min(Math.floor(n), poolSize);
}

/**
 * 从候选池里挑出本次实际执行的引擎。
 * 只做「取前 N」，保持池内顺序——池内顺序就是用户在 zhPool/enPool 里配的优先级，
 * 未经用户许可不重排（轮换是后续批次的事）。
 */
export function selectEngines(engines, configuredMax) {
  const list = Array.isArray(engines) ? engines.filter((e) => typeof e === "string" && e) : [];
  if (list.length === 0) return [];
  return list.slice(0, resolveMaxEngines(configuredMax, list.length));
}

/** 目标成功源数：至少 1（0/负数/非数字都归 1，因为「0 个成功源」没有意义）。 */
export function resolveMinSources(value, poolSize) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.floor(n));
}

/**
 * 主轮结束后，若成功引擎数未达目标，从链路里挑「还没试过」的候选补跑。
 * 已达标时返回空数组——调用方据此一次额外请求都不发（省钱、省限流）。
 */
export function planTopUp({ attempted = [], succeeded = 0, minSources = 1, chain = [] } = {}) {
  if (succeeded >= minSources) return [];
  const tried = new Set(Array.isArray(attempted) ? attempted : []);
  const candidates = Array.isArray(chain) ? chain : [];
  return candidates.filter((engine) => engine && !tried.has(engine));
}

/** 未达标时的说明文字；达标返回 null（不制造噪音）。 */
export function describeTarget({ minSources = 1, achieved = 0 } = {}) {
  if (achieved >= minSources) return null;
  return `sourcesTarget: ${minSources}, achieved: ${achieved}`;
}
