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

/** 在给定的会话上下文里执行 fn；sessionId 为空时也照样执行，只是不带归属。 */
export function withSession(sessionId, fn) {
  return storage.run({ sessionId: String(sessionId ?? "") }, fn);
}

/** 当前异步上下文里的会话 id（没有则为空串）。 */
export function ctxSession() {
  return runStorage.getStore()?.sessionId ?? "";
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
export function begin({ query, engine, mode, timeRange, sessionId } = {}) {
  const run = {
    id: `a${(seq += 1)}`,
    // 归属：显式传入 > 工具分发上下文里的会话 > 空（全局视图）。
    sessionId: String(sessionId ?? ctxSession() ?? ""),
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
  return run;
}

/** 把一次搜索放进异步上下文里跑，让内部各层都能拿到它。 */
export function runWith(run, fn) {
  return runStorage.run(run, fn);
}

function findEngine(run, engine) {
  return run.engines.find((entry) => entry.id === engine && entry.status === "running");
}

/** 标记某个引擎开始尝试。 */
export function engineStart(run, engine) {
  if (!run || !engine) return;
  run.currentEngine = engine;
  if (run.engines.length >= ENGINES_MAX) return;
  run.engines.push({ id: String(engine), status: "running", count: 0, startedAt: now() });
}

/** 结束某个引擎的尝试：count>0 为成功，error 表示失败，skipped 表示跳过。 */
export function engineEnd(run, engine, { count = 0, error, skipped } = {}) {
  if (!run || !engine) return;
  const entry = findEngine(run, engine);
  if (!entry) return;
  entry.count = Number(count) || 0;
  entry.ms = Math.max(0, now() - (entry.startedAt ?? now()));
  entry.status = skipped ? "skipped" : entry.count > 0 ? "ok" : "failed";
  if (entry.status === "failed") entry.failureClass = failureClassOf(error);
  if (entry.status === "skipped") entry.skipReason = skipReasonOf(error);
  run.currentEngine = "";
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
  const endedAt = now();
  const record = {
    id: run.id,
    sessionId: run.sessionId,
    query: run.query,
    mode: run.mode,
    timeRange: run.timeRange,
    startedAt: run.startedAt,
    endedAt,
    ms: endedAt - run.startedAt,
    ok: !error,
    engines: run.engines.map(({ id, status, count, ms, failureClass, skipReason }) => ({
      id,
      status,
      count,
      ms: Math.max(0, ms ?? 0),
      ...(failureClass === undefined ? {} : { failureClass }),
      ...(skipReason === undefined ? {} : { skipReason }),
    })),
    sources: trimSources(result?.sources),
    totalResults: Array.isArray(result?.sources) ? result.sources.length : 0,
    cache: result?._cache === "hit" ? "hit" : "miss",
    ...(error === undefined ? {} : { error: String(error?.message ?? error).slice(0, 300) }),
  };
  history.unshift(record);
  if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX);
}

/** 某个会话的快照：进行中的条目 + 最近一次完成 + 历史。 */
export function snapshot(sessionId = "") {
  const key = String(sessionId ?? "");
  const owns = (entry) => key === "" || entry.sessionId === key;
  const current = inflight.filter(owns).map((run) => ({
    id: run.id,
    query: run.query,
    currentEngine: run.currentEngine,
    enginesDone: run.engines.filter((entry) => entry.status !== "running").length,
    enginesTotal: Math.max(run.engines.length, run.enginesDone),
    engines: run.engines.map(({ id, status, count }) => ({ id, status, count })),
    startedAt: run.startedAt,
    ms: now() - run.startedAt,
  }));
  const forSession = history.filter(owns);
  return {
    current,
    latest: forSession[0] ?? null,
    history: forSession.slice(0, HISTORY_MAX),
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
  history = [];
  inflight = [];
}

export const ACTIVITY_LIMITS = { HISTORY_MAX, SOURCES_MAX, ENGINES_MAX };
