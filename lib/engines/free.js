// Free/keyless engines. Implementation detail lives here; lib/index.js keeps
// the provider wiring and imports the search functions below.
import { uniqueSources, fetchHtmlWithRetry, stripTags, decodeEntities, approximateTimeRange, SEARXNG_INSTANCES, SEARXNG_TIME, ANYSEARCH_URL, EXA_MCP_URL, extractDdgUrl, MARKET_TO_LANG, LANG_PROFILES, BING_URL, DDG_HTML_URL, DDG_LITE_URL, activeAcceptLanguage, USER_AGENT, searchLanguage, configLanguage, activeOutputLanguage } from "./shared.js";

export async function searchDdgHtml(query, maxResults, options, signal) {
  const params = new URLSearchParams({ q: query });
  if (options?.region) params.set("kl", options.region);
  // DDG 安全搜索：off(adlt=-1) / moderate(adlt=0) / strict(adlt=1)
  const adlt = options?.safeSearch ?? "off";
  params.set("adlt", adlt === "strict" ? "1" : adlt === "moderate" ? "0" : "-1");
  // DDG 时间过滤：df=d/w/m/y（只支持固定档，自定义取近似档）
  if (options?.timeRange) {
    const df = { day: "d", week: "w", month: "m", year: "y" }[approximateTimeRange(options.timeRange.days ?? 7)];
    if (df) params.set("df", df);
  }
  const html = await fetchHtmlWithRetry(`${DDG_HTML_URL}?${params}`, signal);
  const blocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) ?? [];
  const sources = [];
  for (const block of blocks) {
    const urlMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"/);
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/);
    const dateMatch = block.match(/<span[^>]*>\s*([\dT:.+-]+)\s*<\/span>/);
    const url = extractDdgUrl(urlMatch?.[1]);
    if (!url) continue;
    sources.push({
      url,
      ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippetMatch ? { snippet: stripTags(snippetMatch[1]) } : {}),
      ...(dateMatch ? { publishedAt: dateMatch[1] } : {}),
    });
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

export async function searchDdgLite(query, maxResults, options, signal) {
  const params = new URLSearchParams({ q: query });
  const adlt = options?.safeSearch ?? "off";
  params.set("adlt", adlt === "strict" ? "1" : adlt === "moderate" ? "0" : "-1");
  // DDG Lite 同样支持 df 时间过滤
  if (options?.timeRange) {
    const df = { day: "d", week: "w", month: "m", year: "y" }[approximateTimeRange(options.timeRange.days ?? 7)];
    if (df) params.set("df", df);
  }
  const html = await fetchHtmlWithRetry(`${DDG_LITE_URL}?${params}`, signal);
  const linkMatches = html.match(/<a[^>]*class=['"]result-link['"][^>]*>[\s\S]*?<\/a>/g) ?? [];
  const snippetMatches = html.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g) ?? [];
  const sources = [];
  for (let i = 0; i < linkMatches.length; i++) {
    const tag = linkMatches[i];
    const hrefMatch = tag.match(/href="([^"]*)"/);
    const titleMatch = tag.match(/class=['"]result-link['"][^>]*>(.*?)<\/a>/);
    if (!hrefMatch) continue;
    const url = extractDdgUrl(hrefMatch[1]);
    if (!url) continue;
    const snippet = snippetMatches[i]?.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/)?.[1];
    sources.push({
      url,
      ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippet ? { snippet: stripTags(snippet) } : {}),
    });
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// Bing 在「查询无结果」时会返回一张完全无关的缓存 SERP（<li class="b_algo"> 照常存在，
// 但内容是别的查询/热门页的内容），直接返回等于把垃圾结果喂给模型（issue #38：YouTube、
// 法语微软文档、瑞士基金等都复现过）。这里用「查询 token 与结果文本是否重叠」识别这种页面。
// token 规则：CJK 取 1-2 字组合（二元组），拉丁/数字取长度 >=2 的词。
function queryOverlapTokens(query) {
  const tokens = new Set();
  for (const run of String(query).match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length <= 2) tokens.add(run);
    for (let i = 0; i + 1 < run.length; i++) tokens.add(run.slice(i, i + 2));
  }
  for (const word of String(query).toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 2) tokens.add(word);
  }
  return [...tokens];
}

function looksRelevant(query, sources) {
  const tokens = queryOverlapTokens(query);
  if (tokens.length === 0) return true; // 纯符号查询无法判定，不拦截
  return sources.some((s) => {
    const hay = `${s.title ?? ""} ${s.snippet ?? ""} ${s.url ?? ""}`.toLowerCase();
    return tokens.some((t) => hay.includes(t.toLowerCase()));
  });
}

// Bing 会把结果 URL 包成 bing.com/ck/a 跳转链接：真实地址在 u 参数（base64url，a1 前缀）
function extractBingUrl(href) {
  if (!href) return href;
  const url = decodeEntities(href); // &amp; -> &
  if (!/^https?:\/\/(www\.)?bing\.com\/ck\/a/i.test(url)) return href;
  try {
    const u = new URL(url).searchParams.get("u");
    if (!u) return href;
    const b64 = u.startsWith("a1") ? u.slice(2) : u;
    const decoded = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return /^https?:\/\//i.test(decoded) ? decoded : href;
  } catch {
    return href;
  }
}

export async function searchBing(query, maxResults, options, signal) {
  // mkt：仅显式 bingMarket 才发。默认不发——mkt=zh-CN 在部分地区/线路会返回空 SERP 容器
  // （#71：海外 IP + mkt=zh-CN → b_algo=0），Bing 会按 Accept-Language 自行本地化。
  const profile = LANG_PROFILES[searchLanguage(configLanguage(options))];
  const params = new URLSearchParams({ q: query });
  if (options?.bingMarket) params.set("mkt", options.bingMarket);
  // Accept-Language：显式 bingMarket 时按 market 反推（避免中文 header 污染），否则用 lang 档案
  const acceptLang = options?.bingMarket
    ? (MARKET_TO_LANG[options.bingMarket] ?? activeAcceptLanguage)
    : (profile.acceptLang ?? activeAcceptLanguage);
  const adlt = options?.safeSearch ?? "off";
  if (adlt === "off") params.set("adlt", "off");
  else if (adlt === "moderate") params.set("adlt", "moderate");
  else if (adlt === "strict") params.set("adlt", "strict");
  // 注意（2026-10-13 实测）：Bing 会对可疑出口 IP 间歇性返回约 91KB 的「空 SERP」（b_algo 块数 0），
  // 表现为按请求频率收紧、减少请求后又自行恢复。曾加过「空 SERP 时多试一次」的兜底，但实测
  // 请求数翻倍反而更容易被压死，且根因在出口 IP 而非解析，故撤掉——修法应让 bing 不走可疑代理
  // （启动脚本的 NO_PROXY 排除 .bing.com 即可恢复）。
  const html = await fetchHtmlWithRetry(`${BING_URL}?${params}`, signal, acceptLang);
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? [];
  const sources = [];
  for (const block of blocks) {
    const hrefMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"/);
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (!hrefMatch) continue;
    sources.push({
      url: extractBingUrl(hrefMatch[1]),
      ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippetMatch ? { snippet: stripTags(snippetMatch[1]) } : {}),
    });
  }
  // Bing 无结果时会返回无关的缓存页：判为 0 结果，交给统一回退链换下一个引擎
  if (sources.length > 0 && !looksRelevant(query, sources)) {
    return { sources: [], truncated: false };
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

//#region searxng (meta-search, free instances, auto-failover)

export async function searchSearxng(query, maxResults, options, signal) {
  const instances = options?.searxngInstances?.length
    ? options.searxngInstances
    : SEARXNG_INSTANCES;
  // 聚合所有实例的失败原因，避免只显示最后一个实例的错误
  const errors = [];
  for (const base of instances) {
    try {
      const params = new URLSearchParams({ q: query, format: "json" });
      // SearXNG 原生支持 time_range 过滤（只支持固定档，自定义取近似档）
      if (options?.timeRange) {
        const tr = SEARXNG_TIME[approximateTimeRange(options.timeRange.days ?? 7)];
        if (tr) params.set("time_range", tr);
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const onAbort = () => ctrl.abort();
      signal?.addEventListener("abort", onAbort);
      const response = await fetch(`${base}/search?${params}`, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json",
          ...(options?.searxngBearerToken ? { authorization: `Bearer ${options.searxngBearerToken}` } : {}),
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (!response.ok) {
        errors.push(`${base}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json().catch(() => null);
      if (!data || !Array.isArray(data.results)) {
        errors.push(`${base}: invalid JSON`);
        continue;
      }
      const sources = data.results
        .filter((r) => r.url)
        .map((r) => ({
          url: r.url,
          ...(r.title ? { title: String(r.title) } : {}),
          ...(r.content ? { snippet: String(r.content) } : {}),
        }));
      if (sources.length > 0) {
        return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
      }
      errors.push(`${base}: 0 results`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${base}: ${message}`);
    }
  }
  // 空实例列表兜底：避免 "all SearXNG instances failed: " 尾巴悬空
  const detail = errors.length > 0 ? errors.join(", ") : "no instances configured";
  // Note 会引用这个错误消息，截断避免 6 实例全挂时刷屏
  throw new Error(`all SearXNG instances failed: ${detail.slice(0, 300)}`);
}
//#endregion

//#region degoog (self-hosted search aggregator, opt-in)
// degoog 的 JSON API：GET /api/search?q=…&type=web（可选 time / lang），结果在 results[] 里
// （url / title / snippet）。实例若开了 apiKeySearchEnabled，需要 Authorization: Bearer <serverKey>。
const DEGOOG_TIME = { day: "day", week: "week", month: "month", year: "year" };

/** 把实例地址规范化成 /api/search URL；允许用户写 `https://host` 或 `https://host/api`。 */
export function degoogSearchUrl(base, query, { timeRange, lang } = {}) {
  const root = String(base ?? "").trim().replace(/\/+$/, "");
  const endpoint = /\/api$/i.test(root) ? `${root}/search` : `${root}/api/search`;
  const params = new URLSearchParams({ q: String(query ?? ""), type: "web" });
  if (timeRange) {
    const tr = DEGOOG_TIME[approximateTimeRange(timeRange.days ?? 7)];
    if (tr) params.set("time", tr);
  }
  if (lang) params.set("lang", String(lang));
  return `${endpoint}?${params}`;
}

export async function searchDegoog(query, maxResults, options, signal) {
  const instances = (Array.isArray(options?.degoogInstances) ? options.degoogInstances : [])
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
  const errors = [];
  for (const base of instances) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const onAbort = () => ctrl.abort();
      signal?.addEventListener("abort", onAbort);
      const response = await fetch(degoogSearchUrl(base, query, { timeRange: options?.timeRange, lang: options?.lang }), {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json",
          ...(options?.degoogApiKey ? { authorization: `Bearer ${options.degoogApiKey}` } : {}),
        },
        redirect: "error",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (response.status === 401 || response.status === 403) {
        errors.push(`${base}: HTTP ${response.status} (check degoogApiKey)`);
        continue;
      }
      if (!response.ok) {
        errors.push(`${base}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json().catch(() => null);
      const rows = Array.isArray(data?.results) ? data.results : [];
      const sources = rows
        .filter((row) => row && row.url)
        .map((row) => ({
          url: String(row.url),
          ...(row.title ? { title: String(row.title) } : {}),
          ...(row.snippet ?? row.content ? { snippet: String(row.snippet ?? row.content) } : {}),
        }));
      if (sources.length > 0) return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
      errors.push(`${base}: 0 results`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${base}: ${message}`);
    }
  }
  const detail = errors.length > 0 ? errors.join(", ") : "no instances configured (set degoogInstances in the plugin config)";
  throw new Error(`all degoog instances failed: ${detail.slice(0, 300)}`);
}
//#endregion
//#region keyless engines (AnySearch / Exa MCP - free, no API key)

// AnySearch: 免费匿名额度（无 key），可选 Bearer key 提额；结构化 JSON 结果
// 401/403：本进程忽略该 key 值（不删除存储），改回匿名免费；不自动清空用户配置
let ignoredAnysearchKey = "";
const ANYSEARCH_KEY_INVALID_NOTE_ZH = "AnySearch key 无效，本次已忽略该 key，改回免费匿名档";
const ANYSEARCH_KEY_INVALID_NOTE_EN = "AnySearch key was rejected; ignored it and used the anonymous tier";
function anysearchKeyNote() {
  return activeOutputLanguage === "zh" ? ANYSEARCH_KEY_INVALID_NOTE_ZH : ANYSEARCH_KEY_INVALID_NOTE_EN;
}

export async function searchAnysearch(query, maxResults, signal, apiKey) {
  const trimmedKey = typeof apiKey === "string" ? apiKey.trim() : "";
  // 本进程已判定无效的 key 不再发送；若配置里仍有该值，结果仍带忽略提示
  const keyIgnoredSticky = Boolean(trimmedKey) && trimmedKey === ignoredAnysearchKey;
  const sendKey = trimmedKey && !keyIgnoredSticky ? trimmedKey : "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const doFetch = async (key) => {
    const headers = { "content-type": "application/json" };
    if (key) headers.authorization = `Bearer ${key}`;
    return await fetch(ANYSEARCH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, max_results: maxResults ?? 5 }),
      signal: controller.signal,
    });
  };
  let response;
  let keyRejected = false;
  try {
    response = await doFetch(sendKey);
    if ((response.status === 401 || response.status === 403) && sendKey) {
      ignoredAnysearchKey = sendKey;
      keyRejected = true;
      response = await doFetch("");
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`AnySearch request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(keyRejected ? `${anysearchKeyNote()} (HTTP ${response.status})` : `AnySearch API error (HTTP ${response.status})`);
  }
  if (!response.ok) throw new Error(`AnySearch API error (HTTP ${response.status})`);
  const data = await response.json();
  if (data.code !== 0) throw new Error(`AnySearch API error: ${data.message ?? data.code}`);
  const results = data.data?.results ?? [];
  return {
    sources: results
      .filter((r) => r.url)
      .map((r) => ({
        url: r.url,
        ...(r.title ? { title: String(r.title) } : {}),
        ...(r.snippet ? { snippet: String(r.snippet).slice(0, 300) } : {}),
      })),
    truncated: false,
    ...(keyRejected || keyIgnoredSticky ? { content: anysearchKeyNote() } : {}),
  };
}

// Exa MCP: 匿名公开 MCP（无 key），web_search_exa 工具
export async function searchExaMCP(query, maxResults, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetch(EXA_MCP_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: "web_search_exa", arguments: { query, numResults: maxResults ?? 5 } },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Exa MCP request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!response.ok) throw new Error(`Exa MCP error (HTTP ${response.status})`);
  const text = await response.text();
  // 解析 SSE 格式：event: message\ndata: {...}
  const lines = text.split("\n");
  let json = null;
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        json = JSON.parse(line.slice(6));
        break;
      } catch {}
    }
  }
  if (!json || json.error) {
    throw new Error(`Exa MCP error: ${json?.error?.message ?? "no data"}`);
  }
  const content = json.result?.content ?? [];
  const sources = [];
  const textBlocks = content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  // 解析 "Title: X\nURL: Y\nPublished: Z\nHighlights:\n..."
  const blocks = textBlocks.split(/\n(?=Title:)/);
  for (const block of blocks) {
    const title = block.match(/^Title: (.+)$/m)?.[1];
    const url = block.match(/^URL: (\S+)$/m)?.[1];
    const published = block.match(/^Published: (.+)$/m)?.[1];
    const highlights = block.split(/^Highlights:$/m)[1]?.split("\n").filter((l) => l.trim() && !l.trim().startsWith("...")).slice(0, 3).join(" ");
    if (!url) continue;
    sources.push({
      url,
      ...(title ? { title } : {}),
      ...(highlights ? { snippet: highlights.slice(0, 300) } : {}),
      // 只保留日期形态（ISO 或 YYYY-MM-DD），过滤 "N/A" 等占位符
      ...(published && /^\d{4}-\d{2}-\d{2}/.test(published) ? { publishedAt: published } : {}),
    });
  }
  return { sources, truncated: false };
}
//#endregion
