// #144：搜索动态面板的数据面。
//
// 宿主的 tools/execute 是「分发前后」的 waterfall，可以把整个工具执行体包在
// 一个 AsyncLocalStorage 里，于是搜索链内部任何 await 之后都还知道「这次是哪个
// 会话调用的」。这比给 provider.search 传参更可靠：宿主自己的 web_search 也走
// ctx.web.search，同样会落进这个上下文。
import { AsyncLocalStorage } from "node:async_hooks";

const HISTORY_MAX = 50;
const SOURCES_MAX = 8;
const ENGINES_MAX = 48;

const storage = new AsyncLocalStorage();
const runStorage = new AsyncLocalStorage();

let seq = 0;
let history = [];
let inflight = [];
// 临时诊断：面板空着时需要能分清「钩子没触发」和「钩子触发但记录丢了」。
let sawHook = 0;
let began = 0;
let finished = 0;
let engineCalls = 0;
let engineDropped = 0;

/** 在给定的会话上下文里执行 fn；sessionId 为空时也照样执行，只是不带归属。 */
export function withSession(sessionId, fn) {
  return storage.run({ sessionId: String(sessionId ?? "") }, fn);
}

/** 当前异步上下文里的会话 id（没有则为空串）。 */
export function ctxSession() {
  return runStorage.getStore()?.sessionId ?? "";
}

/** 当前异步上下文里的对话轮次（0 = 未知）。 */
export function ctxTurn() {
  return Number(runStorage.getStore()?.turn) || 0;
}

/** 当前异步上下文里正在进行的搜索（没有则为 undefined）。 */
export function currentRun() {
  return runStorage.getStore();
}

const now = () => Date.now();

function hostOf(url) {
  try {
    return new URL(String(url ?? "")).host || "";
  } catch {
    return "";
  }
}

function trimSources(sources) {
  if (!Array.isArray(sources)) return [];
  const out = [];
  for (const source of sources) {
    if (out.length >= SOURCES_MAX) break;
    const url = String(source?.url ?? "");
    const title = String(source?.title ?? "").trim() || url;
    out.push({ title, url, host: hostOf(url) });
  }
  return out;
}

/** 开始一次搜索。返回的句柄在结束时要交给 finish()。 */
export function begin({ query, engine, mode, timeRange, sessionId, turn } = {}) {
  const run = {
    id: `a${(seq += 1)}`,
    // 归属：显式传入 > 工具分发上下文里的会话 > 空（全局视图）。
    sessionId: String(sessionId ?? ctxSession() ?? ""),
    // 轮次：同一次对话里第几轮。拿不到就是 0，面板据此决定要不要显示。
    turn: Number.isFinite(Number(turn)) && Number(turn) > 0 ? Number(turn) : ctxTurn(),
    query: String(query ?? "").slice(0, 400),
    mode: String(mode ?? ""),
    timeRange: String(timeRange ?? ""),
    startedAt: now(),
    currentEngine: "",
    engines: [],
    sources: [],
    totalResults: 0,
  };
  inflight.push(run);
  began += 1;
  activeRun = run;
  return run;
}

/** 把一次搜索放进异步上下文里跑，让内部各层都能拿到它。 */
export function runWith(run, fn) {
  return runStorage.run(run, fn);
}

/** 把工具分发上下文（会话 + 轮次）套在工具体上。 */
export function withToolScope(scope, fn) {
  const sessionId = String(scope?.sessionId ?? "");
  const turn = Number(scope?.turn) || 0;
  return runStorage.run({ sessionId, turn }, fn);
}

/** 工具分发钩子被调用的次数（诊断用）。 */
export function noteHook() {
  sawHook += 1;
}

/** 诊断：记录一次「钩子拿到了 agent 但取不出会话 id」的形状，只留首个样本。 */
let missShape = null;
export function noteMiss(exec) {
  if (missShape !== null) return;
  const agent = exec?.agent;
  const shape = agent === undefined
    ? "agent: undefined"
    : [
        "keys=" + Object.keys(agent).join(","),
        "typeof id=" + typeof agent.id,
        "idValue=" + JSON.stringify(agent.id ?? null).slice(0, 40),
        "has session=" + (agent.session !== undefined),
        "session keys=" + (agent.session === undefined ? "-" : Object.keys(agent.session).join(",")),
      ].join(" ");
  missShape = shape;
}

/**
 * 诊断快照。
 *
 * 关键的一对是 sessionHistory / history：只给全局总数看不出隔离是否生效，
 * 面板到底读到的是「本会话的记录」还是「全库的记录」必须并排显示。
 */
export function stats(sessionId = "") {
  const key = String(sessionId ?? "");
  const owns = (entry) => key === "" || entry.sessionId === key;
  return {
    sawHook,
    began,
    finished,
    history: history.length,
    inflight: inflight.length,
    sessionHistory: history.filter(owns).length,
    sessionInflight: inflight.filter(owns).length,
    attributed: history.some((entry) => entry.sessionId !== ""),
    engineCalls,
    engineDropped,
    missShape,
  };
}

function findEngine(run, engine) {
  return run.engines.find((entry) => entry.id === engine && entry.status === "running");
}

/**
 * 模块级「当前 run」。
 *
 * 引擎事件不能只靠 AsyncLocalStorage：engineRuntime.run() 是一个并发限流器，
 * 它把回调排进队列后，执行时的异步上下文已经换掉了，ALS 里取不到 run，
 * 于是 engineStart/engineEnd 被静默丢弃（面板只剩「引擎 暂无」）。
 * 这里留一个模块级引用兜底：begin 时记下，finish 时清掉。
 */
let activeRun = null;

/** 标记某个引擎开始尝试。 */
export function engineStart(run, engine) {
  engineCalls += 1;
  const target = run ?? activeRun;
  if (!target || !engine) { engineDropped += 1; return; }
  target.currentEngine = engine;
  if (target.engines.length >= ENGINES_MAX) return;
  target.engines.push({ id: String(engine), status: "running", count: 0, startedAt: now() });
}

/** 结束某个引擎的尝试：count>0 为成功，error 表示失败，skipped 表示跳过。 */
export function engineEnd(run, engine, { count = 0, error, skipped } = {}) {
  const target = run ?? activeRun;
  if (!target || !engine) { engineDropped += 1; return; }
  const entry = findEngine(target, engine);
  if (!entry) return;
  entry.count = Number(count) || 0;
  entry.ms = Math.max(0, now() - (entry.startedAt ?? now()));
  entry.status = skipped ? "skipped" : entry.count > 0 ? "ok" : "failed";
  if (entry.status === "failed") entry.failureClass = failureClassOf(error);
  if (entry.status === "skipped") entry.skipReason = skipReasonOf(error);
  target.currentEngine = "";
}

function failureClassOf(error) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (error?.class) return String(error.class);
  if (/\b429\b|rate limit|too many requests/.test(message)) return "quota";
  if (/\b40[13]\b|unauthorized|invalid api key/.test(message)) return "auth";
  if (/403|captcha|bot|blocked/.test(message)) return "bot-wall";
  if (/timeout|econnreset|enotfound|network|fetch failed/.test(message)) return "transient";
  if (/0 results|parse|invalid/.test(message)) return "invalid-response";
  return "unknown";
}

function skipReasonOf(error) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (/time/.test(message)) return "time-filter";
  if (/key|credential/.test(message)) return "no-key";
  if (/disabled/.test(message)) return "disabled";
  return "skipped";
}

/** 结束一次搜索。result 为成功结果，error 为失败。 */
export function finish(run, { result, error } = {}) {
  if (!run) return;
  inflight = inflight.filter((entry) => entry !== run);
  if (activeRun === run) activeRun = null;
  finished += 1;

  // 缓存命中的引擎记录由 noteCacheHit 在命中点写入（那里能拿到缓存里的
  // provider）。这里只兜底：如果命中路径没记上，至少别让引擎栏空着。
  if (result?._cache === "hit" && run.engines.length === 0) {
    noteCacheHit(run, result?.provider ?? result?.engine, Array.isArray(result?.sources) ? result.sources.length : 0);
  }
  const endedAt = now();
  const record = {
    id: run.id,
    sessionId: run.sessionId,
    query: run.query,
    mode: run.mode,
    timeRange: run.timeRange,
    turn: run.turn ?? 0,
    startedAt: run.startedAt,
    endedAt,
    ms: endedAt - run.startedAt,
    ok: !error,
    engines: run.engines.map(({ id, status, count, ms, failureClass, skipReason, cached }) => ({
      id,
      status,
      count,
      ms: Math.max(0, ms ?? 0),
      ...(failureClass === undefined ? {} : { failureClass }),
      ...(skipReason === undefined ? {} : { skipReason }),
      ...(cached === true ? { cached: true } : {}),
    })),
    sources: trimSources(result?.sources),
    totalResults: Array.isArray(result?.sources) ? result.sources.length : 0,
    cache: result?._cache === "hit" ? "hit" : "miss",
    ...(error === undefined ? {} : { error: String(error?.message ?? error).slice(0, 300) }),
  };
  history.unshift(record);
  if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX);
}

/**
 * 记一次缓存命中。
 *
 * 缓存命中会从 provider.search 的早退分支直接返回，根本不进引擎循环，
 * 于是 run.engines 是空的，面板只能显示「引擎 暂无」。
 * 缓存条目里保存着当时的 provider（= 真正跑出这批结果的引擎），用它补一条。
 */
export function noteCacheHit(run, engine, count) {
  const id = String(engine ?? "").trim() || "cache";
  const target = run ?? activeRun;
  if (!target) return;
  // 已经有同样一条就不再重复（同一引擎命中两次缓存的情况）。
  const existing = target.engines.find((entry) => entry.id === id && entry.cached === true);
  if (existing !== undefined) {
    existing.count = Number(count) || existing.count;
    return;
  }
  target.engines.push({
    id,
    status: "ok",
    count: Number(count) || 0,
    startedAt: target.startedAt,
    ms: 0,
    cached: true,
  });
}

/** 某个会话的快照：进行中的条目 + 最近一次完成 + 历史。 */
export function snapshot(sessionId = "") {
  const key = String(sessionId ?? "");
  const owns = (entry) => key === "" || entry.sessionId === key;
  const current = inflight.filter(owns).map((run) => ({
    id: run.id,
    query: run.query,
    turn: run.turn ?? 0,
    currentEngine: run.currentEngine,
    enginesDone: run.engines.filter((entry) => entry.status !== "running").length,
    enginesTotal: Math.max(run.engines.length, run.enginesDone),
    engines: run.engines.map(({ id, status, count }) => ({ id, status, count })),
    startedAt: run.startedAt,
    ms: now() - run.startedAt,
  }));
  const forSession = history.filter(owns);
  // 归因兜底：如果这条会话名下一条都没有，而全库记录也全都没带会话 id
  // （宿主没给 agent 身份的情形），就让面板显示这些记录，否则面板永远是空的。
  // 只要有任何记录带了别的会话 id，就不越权显示。
  const unattributed = history.every((entry) => entry.sessionId === "");
  const visible = forSession.length > 0 || key === "" || !unattributed ? forSession : history;
  // 同一份兜底也要用在 in-flight 上，否则「进行中」那一块永远是空的。
  const currentVisible = !unattributed || key === "" || current.length > 0
    ? current
    : inflight.map((run) => ({
        id: run.id,
        query: run.query,
        currentEngine: run.currentEngine,
        enginesDone: run.engines.filter((entry) => entry.status !== "running").length,
        enginesTotal: Math.max(run.engines.length, run.enginesDone),
        engines: run.engines.map(({ id, status, count }) => ({ id, status, count })),
        startedAt: run.startedAt,
        ms: now() - run.startedAt,
      }));
  return {
    current: currentVisible,
    latest: visible[0] ?? null,
    history: visible.slice(0, HISTORY_MAX),
  };
}

/** 清空记录（只影响内存）。 */
export function clear(sessionId = "") {
  const key = String(sessionId ?? "");
  if (key === "") {
    history = [];
    inflight = [];
    return;
  }
  history = history.filter((entry) => entry.sessionId !== key);
  inflight = inflight.filter((entry) => entry.sessionId !== key);
}

/** 测试用：把模块状态恢复干净。 */
export function resetForTests() {
  seq = 0;
  activeRun = null;
  engineCalls = 0;
  engineDropped = 0;
  history = [];
  inflight = [];
  sawHook = 0;
  began = 0;
  finished = 0;
}

export const ACTIVITY_LIMITS = { HISTORY_MAX, SOURCES_MAX, ENGINES_MAX };
