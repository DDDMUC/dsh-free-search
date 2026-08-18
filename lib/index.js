import { SettingsConflictError, installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const DDG_LITE_URL = "https://lite.duckduckgo.com/lite/";
const BING_URL = "https://www.bing.com/search";
const TAVILY_URL = "https://api.tavily.com/search";
const KEENABLE_URL = "https://api.keenable.ai/v1/search";
const KEENABLE_MCP_URL = "https://api.keenable.ai/mcp";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ACCEPT_LANG = "zh-CN,zh;q=0.9,en;q=0.8";

const FREE_SEARCH_NS = settingsNamespace("free-search");
const BRIDGE_PREFIX = "/api/dsh-free-search-settings";
const FREE_ENGINES = ["ddg", "ddg-lite", "bing", "searxng", "anysearch"];
const ALL_ENGINES = ["ddg", "ddg-lite", "bing", "searxng", "anysearch", "exa", "tavily", "keenable", "perplexity", "deepseek-official"];

// time_range 支持：固定档 day/week/month/year，或自定义（相对 12h/3d/2mo/1y、绝对 YYYY-MM-DD）
const TIME_RANGES = ["day", "week", "month", "year"];
const DAYS_BY_RANGE = { day: 1, week: 7, month: 30, year: 365 };
const KEENABLE_REL = { day: "1d", week: "7d", month: "1mo", year: "1y" };
const SEARXNG_TIME = { day: "day", week: "week", month: "month", year: "year" };

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

// 把用户/agent 给的 timeRange 解析成统一对象：{ days } 相对天数，或 { after } 绝对日期。
// 输入支持：day/week/month/year、12h/3d/2mo/1y、2026-07-01，或已解析的 {days}/{after} 对象。
// 无效返回 undefined。
function parseTimeRange(input) {
  if (input === undefined || input === null) return undefined;
  // 已解析对象：直接透传
  if (typeof input === "object") {
    if (typeof input.after === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.after)) return { after: input.after };
    if (typeof input.days === "number" && Number.isFinite(input.days) && input.days > 0) return { days: input.days };
    return undefined;
  }
  const s = String(input).trim().toLowerCase();
  if (s.length === 0) return undefined;
  if (TIME_RANGES.includes(s)) return { days: DAYS_BY_RANGE[s] };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { after: s };
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(h|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|year|years)$/);
  if (m) {
    const n = parseFloat(m[1]);
    const unit = m[2][0];
    const days =
      unit === "h" ? n / 24 : unit === "d" ? n : unit === "w" ? n * 7 : unit === "m" ? n * 30 : n * 365;
    return { days };
  }
  return undefined;
}

// 把自定义天数映射到只支持固定档的引擎（Tavily / SearXNG / DDG）的最近似档位
function approximateTimeRange(days) {
  if (days <= 2) return "day";
  if (days <= 14) return "week";
  if (days <= 90) return "month";
  return "year";
}

function decodeEntities(text) {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractDdgUrl(rel) {
  if (!rel) return null;
  const m = rel.match(/uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  if (rel.startsWith("//")) return `https:${rel}`;
  return rel;
}

function uniqueSources(sources, limit) {
  const seen = new Set();
  const out = [];
  for (const s of sources) {
    if (s.url && !seen.has(s.url)) {
      seen.add(s.url);
      out.push(s);
    }
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchHtml(url, signal) {
  // 单次请求超时 12s，避免挂起被当成 Connection error
  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, "accept-language": ACCEPT_LANG },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`connection error: ${error?.message ?? String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url.split("?")[0]}`);
  }
  const html = await response.text();
  // DuckDuckGo 反爬验证页检测（HTTP 202 或验证关键字）
  if (response.status === 202 || /anomaly|captcha|unusual traffic|robot check/i.test(html.slice(0, 4000))) {
    throw new Error("DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary) - Bing works");
  }
  return html;
}

// 带重试的抓取：网络错误/空结果时重试，间隔 1.5s，最多 3 次
async function fetchHtmlWithRetry(url, signal) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const html = await fetchHtml(url, signal);
      if (html.length > 500) return html;
      lastError = new Error(`empty response (${html.length} bytes)`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw lastError ?? new Error("fetch failed");
}

async function searchDdgHtml(query, maxResults, options, signal) {
  const params = new URLSearchParams({ q: query });
  if (options?.region) params.set("kl", options.region);
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

async function searchDdgLite(query, maxResults, options, signal) {
  const params = new URLSearchParams({ q: query });
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

async function searchBing(query, maxResults, options, signal) {
  const params = new URLSearchParams({ q: query, mkt: options?.bingMarket ?? "zh-CN" });
  const html = await fetchHtmlWithRetry(`${BING_URL}?${params}`, signal);
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? [];
  const sources = [];
  for (const block of blocks) {
    const hrefMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"/);
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (!hrefMatch) continue;
    sources.push({
      url: hrefMatch[1],
      ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippetMatch ? { snippet: stripTags(snippetMatch[1]) } : {}),
    });
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

//#region searxng (meta-search, free instances, auto-failover)
const SEARXNG_INSTANCES = [
  "https://opnxng.com",
  "https://priv.au",
  "https://searx.be",
  "https://searx.tiekoetter.com",
  "https://search.inetol.net",
  "https://paulgo.io",
];

async function searchSearxng(query, maxResults, options, signal) {
  const instances = options?.searxngInstances?.length
    ? options.searxngInstances
    : SEARXNG_INSTANCES;
  let lastError = null;
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
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (!response.ok) {
        lastError = new Error(`${base} HTTP ${response.status}`);
        continue;
      }
      const data = await response.json().catch(() => null);
      if (!data || !Array.isArray(data.results)) {
        lastError = new Error(`${base} invalid JSON`);
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
      lastError = new Error(`${base} 0 results`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("all SearXNG instances failed");
}
//#endregion

//#region keyless engines (AnySearch / Exa MCP - free, no API key)
const ANYSEARCH_URL = "https://api.anysearch.com/v1/search";
const EXA_MCP_URL = "https://mcp.exa.ai/mcp";

// AnySearch: 免费匿名额度（无 key），结构化 JSON 结果
async function searchAnysearch(query, maxResults, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetch(ANYSEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, max_results: maxResults ?? 5 }),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`AnySearch request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
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
  };
}

// Exa MCP: 匿名公开 MCP（无 key），web_search_exa 工具
async function searchExaMCP(query, maxResults, signal) {
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
      ...(published ? { publishedAt: published } : {}),
    });
  }
  return { sources, truncated: false };
}
//#endregion

//#region platform search (GitHub / V2EX / Bilibili / Reddit)
const PLATFORMS = {
  github: { name: "GitHub" },
  v2ex: { name: "V2EX" },
  bilibili: { name: "Bilibili" },
};

async function searchGithub(query, maxResults, signal) {
  const response = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${maxResults ?? 5}`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/vnd.github+json" },
      ...(signal !== undefined ? { signal } : {}),
    }
  );
  if (!response.ok) throw new Error(`GitHub API error (HTTP ${response.status})`);
  const data = await response.json();
  return {
    sources: (data.items ?? []).map((item) => ({
      url: item.html_url,
      title: item.full_name ?? item.name,
      snippet: `${item.description ?? ""}${item.stargazers_count ? ` ⭐${item.stargazers_count}` : ""}`.trim(),
    })),
    truncated: false,
  };
}

async function searchV2ex(query, maxResults, signal) {
  const response = await fetch("https://www.v2ex.com/api/topics/hot.json", {
    headers: { "user-agent": USER_AGENT },
    ...(signal !== undefined ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`V2EX API error (HTTP ${response.status})`);
  const topics = await response.json();
  const q = query.toLowerCase();
  const matched = Array.isArray(topics)
    ? topics.filter((t) => (t.title ?? "").toLowerCase().includes(q) || (t.content ?? "").toLowerCase().includes(q))
    : [];
  return {
    sources: matched.slice(0, maxResults ?? 5).map((t) => ({
      url: `https://www.v2ex.com/t/${t.id}`,
      title: t.title,
      ...(t.content ? { snippet: String(t.content).slice(0, 200) } : {}),
    })),
    truncated: false,
  };
}

async function searchBilibili(query, maxResults, signal) {
  const response = await fetch(
    `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(query)}`,
    {
      headers: { "user-agent": USER_AGENT, referer: "https://www.bilibili.com" },
      ...(signal !== undefined ? { signal } : {}),
    }
  );
  if (!response.ok) throw new Error(`Bilibili API error (HTTP ${response.status})`);
  const data = await response.json();
  if (data.code !== 0) throw new Error(`Bilibili API error: ${data.message ?? data.code}`);
  const sources = [];
  for (const section of data.data?.result ?? []) {
    for (const item of section.data ?? []) {
      if (!item.arcurl) continue;
      sources.push({
        url: item.arcurl,
        title: item.title ? String(item.title).replace(/<[^>]+>/g, "") : item.bvid,
        ...(item.desc ? { snippet: String(item.desc).slice(0, 200) } : {}),
      });
      if (sources.length >= (maxResults ?? 5)) break;
    }
    if (sources.length >= (maxResults ?? 5)) break;
  }
  return { sources, truncated: false };
}

async function searchReddit(query, maxResults, signal) {
  const response = await fetch(
    `https://old.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${maxResults ?? 5}&sort=relevance`,
    {
      headers: {
        "user-agent": `${USER_AGENT} (dsh-free-search; contact: github.com/DDDMUC)`,
        accept: "application/json",
      },
      ...(signal !== undefined ? { signal } : {}),
    }
  );
  if (!response.ok) throw new Error(`Reddit API error (HTTP ${response.status})`);
  const data = await response.json();
  return {
    sources: (data.data?.children ?? [])
      .map((c) => c.data)
      .filter((p) => p && p.url)
      .map((p) => ({
        url: p.url,
        title: p.title ?? "",
        ...(p.selftext ? { snippet: String(p.selftext).slice(0, 200) } : {}),
      })),
    truncated: false,
  };
}

async function searchPlatform(platform, query, maxResults, signal) {
  switch (platform) {
    case "github":
      return searchGithub(query, maxResults, signal);
    case "v2ex":
      return searchV2ex(query, maxResults, signal);
    case "bilibili":
      return searchBilibili(query, maxResults, signal);
    case "reddit":
      return searchReddit(query, maxResults, signal);
    default:
      throw new Error(`unknown platform: ${platform}`);
  }
}
//#endregion

//#region paid engines (exa / tavily / perplexity / deepseek-official)
async function searchExa(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Exa search requires EXA_API_KEY");
  const body = {
    query,
    type: "auto",
    contents: { highlights: { highlightsPerUrl: 1 } },
    ...(maxResults !== undefined ? { numResults: maxResults } : {}),
  };
  // Exa 时间过滤：startPublishedDate（ISO 日期；支持任意天数和绝对日期）
  if (timeRange) {
    if (timeRange.after) body.startPublishedDate = timeRange.after;
    else if (timeRange.days !== undefined) body.startPublishedDate = isoDaysAgo(timeRange.days);
  }
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify(body),
    ...(signal !== undefined ? { signal } : {}),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("Exa API key is invalid (HTTP 401) - update it in Settings > Plugins > Free Search");
    }
    throw new Error(`Exa API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const sources = (data.results ?? [])
    .map((result) => {
      const snippet = result.highlights?.find((h) => h.trim().length > 0);
      if (!snippet) return null;
      return {
        url: result.url,
        ...(result.title ? { title: result.title } : {}),
        snippet,
        ...(result.publishedDate ? { publishedAt: result.publishedDate } : {}),
      };
    })
    .filter(Boolean);
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// Tavily: 无 key 走 keyless（免费匿名额度），有 key 走账号档（Bearer）
async function searchTavily(query, maxResults, apiKey, timeRange, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    const body = {
      query,
      max_results: Math.min(maxResults ?? 5, 20),
      search_depth: "basic",
    };
    // Tavily 时间过滤：time_range 只支持固定档，自定义天数取最近似档位
    if (timeRange) {
      const tr = approximateTimeRange(timeRange.days ?? 7);
      if (tr) body.time_range = tr;
    }
    response = await fetch(TAVILY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : { "x-tavily-access-mode": "keyless" }),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Tavily request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("Tavily API key is invalid (HTTP 401) - update it in Settings > Plugins > Free Search");
    }
    throw new Error(`Tavily API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const sources = (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.content ? { snippet: String(r.content).slice(0, 300) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// 把任意天数转成 Keenable 的相对时间格式（12h / Nd / Nmo / Ny）
function formatKeenableRelative(days) {
  if (days <= 0.5) return "12h";
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

// Keenable: 有 key 走 REST API（X-API-Key），无 key 走 keyless MCP（免费匿名额度）
function extractKeenableSources(text, maxResults) {
  const sources = [];
  const blocks = String(text).split(/\n(?=Title:)/);
  for (const block of blocks) {
    const title = block.match(/^Title: (.+)$/m)?.[1];
    const url = block.match(/^URL: (\S+)$/m)?.[1];
    const published = block.match(/^Published: (.+)$/m)?.[1] ?? block.match(/^Acquired: (.+)$/m)?.[1];
    const snippets = block.split(/^Snippets:$/m)[1]?.split("\n").filter((l) => l.trim()).slice(0, 3).join(" ");
    if (!url) continue;
    sources.push({
      url,
      ...(title ? { title } : {}),
      ...(snippets ? { snippet: snippets.slice(0, 300) } : {}),
      ...(published ? { publishedAt: published } : {}),
    });
  }
  return uniqueSources(sources, maxResults ?? 10);
}

async function searchKeenableREST(query, maxResults, apiKey, timeRange, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    const body = { query, mode: "realtime" };
    // Keenable 时间过滤：published_after（相对 12h/7d/1mo/1y 或绝对 YYYY-MM-DD）
    if (timeRange) {
      if (timeRange.after) body.published_after = timeRange.after;
      else if (timeRange.days !== undefined) body.published_after = formatKeenableRelative(timeRange.days);
    }
    response = await fetch(KEENABLE_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Keenable request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("Keenable API key is invalid (HTTP 401) - update it in Settings > Plugins > Free Search");
    }
    throw new Error(`Keenable API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const sources = (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.snippet ?? r.description ? { snippet: String(r.snippet ?? r.description).slice(0, 300) } : {}),
      ...(r.published_at ? { publishedAt: String(r.published_at) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

async function searchKeenableMCP(query, maxResults, timeRange, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    const arguments_ = { query };
    // Keenable MCP 支持 published_after（相对或绝对日期）
    if (timeRange) {
      if (timeRange.after) arguments_.published_after = timeRange.after;
      else if (timeRange.days !== undefined) arguments_.published_after = formatKeenableRelative(timeRange.days);
    }
    response = await fetch(KEENABLE_MCP_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: "search_web_pages", arguments: arguments_ },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Keenable MCP request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!response.ok) throw new Error(`Keenable MCP error (HTTP ${response.status})`);
  const data = await response.json();
  if (data.error) throw new Error(`Keenable MCP error: ${data.error?.message ?? "unknown"}`);
  const content = data.result?.content ?? [];
  // isError=true 时 content 里是错误文本
  const text = content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (data.result?.isError) throw new Error(`Keenable MCP error: ${text.slice(0, 200)}`);
  return { sources: extractKeenableSources(text, maxResults ?? 10), truncated: false };
}

async function searchKeenable(query, maxResults, apiKey, timeRange, signal) {
  if (apiKey) return searchKeenableREST(query, maxResults, apiKey, timeRange, signal);
  return searchKeenableMCP(query, maxResults, timeRange, signal);
}

async function searchPerplexity(query, maxResults, apiKey, signal) {
  if (!apiKey) throw new Error("Perplexity search requires PERPLEXITY_API_KEY");
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      max_tokens: 1024,
      messages: [{ role: "user", content: query }],
    }),
    ...(signal !== undefined ? { signal } : {}),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("Perplexity API key is invalid (HTTP 401) - update it in Settings > Plugins > Free Search");
    }
    throw new Error(`Perplexity API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content ?? "";
  const citations = data.citations ?? [];
  const sources = citations.map((url) => ({ url, ...(answer ? { snippet: answer.slice(0, 200) } : {}) }));
  return {
    content: answer,
    sources: uniqueSources(sources, maxResults ?? 10),
    truncated: false,
  };
}

async function searchDeepSeekOfficial(query, maxResults, apiKey, signal) {
  if (!apiKey) throw new Error("DeepSeek search requires DEEPSEEK_API_KEY");
  const response = await fetch("https://api.deepseek.com/anthropic/v1/messages", {
    method: "POST",
    redirect: "error",
    headers: {
      "x-api-key": apiKey,
      authorization: `Bearer ${apiKey}`,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `Perform a web search for the query: ${query}` }],
        },
      ],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
    }),
    ...(signal !== undefined ? { signal } : {}),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("DeepSeek API key is invalid (HTTP 401) - update it in Settings > Plugins > Free Search");
    }
    throw new Error(`DeepSeek API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const blocks = data.content ?? [];
  const resultBlocks = blocks.filter((block) => block.type === "web_search_tool_result");
  const snippets = new Map();
  for (const block of blocks) {
    if (block.type !== "text") continue;
    for (const cite of block.citations ?? []) {
      if (cite.url && cite.cited_text && !snippets.has(cite.url)) snippets.set(cite.url, cite.cited_text);
    }
  }
  const sources = [];
  for (const block of resultBlocks) {
    for (const item of block.content ?? []) {
      if (item.type !== "web_search_result" || !item.url) continue;
      if (sources.some((s) => s.url === item.url)) continue;
      sources.push({
        url: item.url,
        ...(item.title ? { title: item.title } : {}),
        ...(snippets.get(item.url) ? { snippet: snippets.get(item.url) } : {}),
        ...(item.page_age ? { publishedAt: item.page_age } : {}),
      });
    }
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}
//#endregion

//#region bridge
const MAX_JSON_BODY_BYTES = 64 * 1024;

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress;
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL("http://" + host);
  } catch {
    return false;
  }
  if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "referrer-policy": "no-referrer" });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk;
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) return undefined;
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

function toView(descriptor) {
  return {
    ns: String(descriptor.ns),
    schema: descriptor.schema,
    value: descriptor.value,
    ...(descriptor.base === undefined ? {} : { base: descriptor.base }),
    ...(descriptor.user === undefined ? {} : { user: descriptor.user }),
    ...(descriptor.secrets === undefined
      ? {}
      : { secrets: descriptor.secrets.map((secret) => ({ path: [...secret.path], set: secret.set })) }),
    revision: descriptor.revision,
  };
}

function makeBridgeRoutes(settings, search, testEngine) {
  const allowlisted = () =>
    settings
      .describe({ redactSecrets: true })
      .filter((descriptor) => String(descriptor.ns) === FREE_SEARCH_NS)
      .map((descriptor) => String(descriptor.ns));

  const handlers = {
    async rawSearch(request) {
      if (request === null || typeof request !== "object" || typeof request.query !== "string" || request.query.length === 0) {
        return { ok: false, code: "search-rejected", message: "malformed bridge search request (query is required)" };
      }
      const maxResults = Math.min(Math.max(Number(request.maxResults) || 5, 1), 10);
      const timeRange = parseTimeRange(request.timeRange);
      // 指定 engine：直测该引擎本身（不走回退链），报告它自己的可用性
      if (typeof request.engine === "string" && request.engine.length > 0) {
        if (typeof testEngine !== "function") {
          return { ok: false, code: "search-unavailable", message: "engine test is not wired" };
        }
        try {
          const result = await testEngine(request.engine, request.query, timeRange);
          if (result.ok === false) {
            return { ok: false, code: "engine-failed", message: result.error ?? `${request.engine} failed` };
          }
          return {
            ok: true,
            value: {
              provider: request.engine,
              sources: result.sources ?? [],
              content: result.content ?? "",
            },
          };
        } catch (error) {
          return { ok: false, code: "engine-failed", message: error instanceof Error ? error.message : String(error) };
        }
      }
      if (typeof search !== "function") {
        return { ok: false, code: "search-unavailable", message: "search provider is not wired" };
      }
      try {
        const result = await search({ ...request, maxResults, timeRange });
        return {
          ok: true,
          value: {
            // 实际使用的引擎：provider.search 在成功时返回 provider 字段
            provider: result.provider ?? request.engine ?? request.provider ?? "bing",
            sources: result.sources ?? [],
            content: result.content ?? "",
          },
        };
      } catch (error) {
        return { ok: false, code: "search-failed", message: error instanceof Error ? error.message : String(error) };
      }
    },
    async describe() {
      const descriptors = settings.describe({ redactSecrets: true });
      return {
        ok: true,
        value: {
          namespaces: allowlisted()
            .map((ns) => descriptors.find((descriptor) => String(descriptor.ns) === ns))
            .filter((descriptor) => descriptor !== undefined)
            .map(toView),
          writable: settings.writable !== false,
        },
      };
    },
    async mutate(request) {
      const body = request;
      if (body === null || typeof body !== "object" || typeof body.ns !== "string" || !Array.isArray(body.ops)) {
        return { ok: false, code: "settings-rejected", message: "malformed bridge settings request" };
      }
      const { ns } = body;
      if (!allowlisted().includes(ns)) {
        return { ok: false, code: "settings-not-exposed", message: `settings namespace "${ns}" is not exposed` };
      }
      const expectedRevision = typeof body.expectedRevision === "number" ? body.expectedRevision : undefined;
      try {
        await settings.mutate(settingsNamespace(ns), body.ops, expectedRevision);
      } catch (error) {
        if (error instanceof SettingsConflictError) {
          return { ok: false, code: "settings-conflict", message: error.message };
        }
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, code: "internal", message };
      }
      const descriptor = settings.describe({ redactSecrets: true }).find((candidate) => String(candidate.ns) === ns);
      if (descriptor === undefined) {
        return { ok: false, code: "internal", message: `settings namespace "${ns}" was disposed after the mutate` };
      }
      return { ok: true, value: toView(descriptor) };
    },
  };

  const guard = (req, res) => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: "loopback requests only" });
      return false;
    }
    if (req.method !== "POST") {
      writeJson(res, 405, { error: "method not allowed: " + (req.method ?? "") });
      return false;
    }
    return true;
  };

  return [
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/describe`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        writeJson(res, 200, await handlers.describe());
      },
    },
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/mutate`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        const body = await readJsonBody(req);
        if (body === undefined) {
          writeJson(res, 400, { ok: false, code: "settings-rejected", message: "malformed JSON body" });
          return;
        }
        writeJson(res, 200, await handlers.mutate(body));
      },
    },
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/raw-search`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        const body = await readJsonBody(req);
        if (body === undefined) {
          writeJson(res, 400, { ok: false, code: "search-rejected", message: "malformed JSON body" });
          return;
        }
        writeJson(res, 200, await handlers.rawSearch(body));
      },
    },
  ];
}
//#endregion

const name = "web-search-free";
const inject = ["web"];

const Config = z.object({
  provider: z.string().default("bing"),
  lang: z.string().default("zh"),
  region: z.string(),
  bingMarket: z.string().default("zh-CN"),
  searxngInstances: z.array(z.string()),
  platforms: z.array(z.string()).default(["github", "v2ex", "bilibili"]),
  exaApiKey: z.string().role("secret"),
  tavilyApiKey: z.string().role("secret"),
  keenableApiKey: z.string().role("secret"),
  perplexityApiKey: z.string().role("secret"),
  deepseekApiKey: z.string().role("secret"),
});

function apply(ctx, config) {
  let current = () => config ?? {};
  const logger = ctx.logger;
  const credentials = ctx.get("credentials");

  // 系统提示词动态刷新：设置变更时重新生成，避免显示旧引擎
  let refreshPrompt = null;

  // key 优先级：settings 的 free-search.<x>ApiKey > 环境变量/credentials
  const resolveApiKey = async (envName, settingsKey) => {
    const cfg = current();
    if (settingsKey && cfg[settingsKey]) return cfg[settingsKey];
    if (credentials) {
      try {
        const resolved = await credentials.resolve(envName);
        if (resolved?.value) return resolved.value;
      } catch {}
    }
    return process.env[envName] ?? "";
  };

  // 总控 provider：按 settings 的 provider 字段路由到任意引擎。
  // 任何引擎失败（缺 key / 401 / 限流 / 网络）都会自动轮流尝试下一个引擎，
  // 直到成功或全部失败。并在结果里附带回退提示，避免 agent 搜索直接失败。
  const provider = {
    id: "ddg",
    available() {
      return true;
    },
    async search(request, signal) {
      const cfg = current();
      const preferred = cfg.provider ?? "bing";
      // time_range 过滤（仅 advanced_search 工具透传；标准 web_search 无此参数）
      const timeRange = parseTimeRange(request.timeRange);

      // 统一引擎链：首选优先，然后其他付费引擎（有 key 的优先尝试），最后免费引擎
      const paidEngines = ["exa", "tavily", "keenable", "perplexity", "deepseek-official"];
      const freeEngines = ["bing", "anysearch", "ddg", "ddg-lite", "searxng"];
      // 支持 time_range 过滤的引擎：tavily / exa / keenable / searxng / ddg / ddg-lite
      const timeEngines = ["tavily", "exa", "keenable", "searxng", "ddg", "ddg-lite"];
      let chain;
      if (timeRange) {
        // 有时间过滤需求时，把支持过滤的引擎排前面（首选引擎若支持仍优先）
        const preferredFirst = [preferred].filter((e) => timeEngines.includes(e));
        const otherTime = timeEngines.filter((e) => e !== preferred);
        const noTime = [...paidEngines, ...freeEngines].filter((e) => !timeEngines.includes(e) && e !== preferred);
        chain = [...preferredFirst, ...otherTime, ...noTime];
      } else {
        const othersPaid = paidEngines.filter((e) => e !== preferred);
        const othersFree = freeEngines.filter((e) => e !== preferred);
        chain = [preferred, ...othersPaid, ...othersFree];
      }

      let lastError = null;
      let usedEngine = null;
      for (const engine of chain) {
        try {
          let result;
          if (engine === "ddg") {
            result = await searchDdgHtml(request.query, request.maxResults, { ...cfg, timeRange }, signal);
          } else if (engine === "ddg-lite") {
            result = await searchDdgLite(request.query, request.maxResults, { ...cfg, timeRange }, signal);
          } else if (engine === "bing") {
            result = await searchBing(request.query, request.maxResults, cfg, signal);
          } else if (engine === "searxng") {
            result = await searchSearxng(request.query, request.maxResults, { ...cfg, timeRange }, signal);
          } else if (engine === "anysearch") {
            result = await searchAnysearch(request.query, request.maxResults, signal);
          } else if (engine === "exa") {
            // exa：有 key 走 REST，无 key 走 keyless MCP（免费）
            const key = await resolveApiKey("EXA_API_KEY", "exaApiKey");
            if (key) {
              result = await searchExa(request.query, request.maxResults, key, timeRange, signal);
            } else {
              result = await searchExaMCP(request.query, request.maxResults, signal);
            }
          } else if (engine === "tavily") {
            // tavily：有 key 走账号档，无 key 走 keyless（免费匿名额度）
            const key = await resolveApiKey("TAVILY_API_KEY", "tavilyApiKey");
            result = await searchTavily(request.query, request.maxResults, key, timeRange, signal);
          } else if (engine === "keenable") {
            // keenable：有 key 走 REST，无 key 走 keyless MCP（免费）
            const key = await resolveApiKey("KEENABLE_API_KEY", "keenableApiKey");
            result = await searchKeenable(request.query, request.maxResults, key, timeRange, signal);
          } else if (engine === "perplexity") {
            const key = await resolveApiKey("PERPLEXITY_API_KEY", "perplexityApiKey");
            if (!key) {
              lastError = new Error("Perplexity requires PERPLEXITY_API_KEY");
              logger.warn(`free-search: engine "${engine}" skipped (no key), trying next engine`);
              continue; // 无 key 跳过
            }
            result = await searchPerplexity(request.query, request.maxResults, key, signal);
          } else if (engine === "deepseek-official") {
            const key = await resolveApiKey("DEEPSEEK_API_KEY", "deepseekApiKey");
            if (!key) {
              lastError = new Error("DeepSeek requires DEEPSEEK_API_KEY");
              logger.warn(`free-search: engine "${engine}" skipped (no key), trying next engine`);
              continue; // 无 key 跳过
            }
            result = await searchDeepSeekOfficial(request.query, request.maxResults, key, signal);
          } else {
            continue;
          }

          if (result.sources.length > 0) {
            usedEngine = engine;
            // 用了非首选引擎时，在结果里附上提示（agent 会看到）
            if (engine !== preferred) {
              result.content = `Note: ${preferred} unavailable or failed, using ${engine}.`;
            }
            return { ...result, provider: engine, engine: engine };
          }
          lastError = new Error(`engine "${engine}" returned 0 results`);
          logger.warn(`free-search: ${engine} returned 0 results, trying next engine`);
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          logger.warn(`free-search: engine "${engine}" failed (${message}), trying next engine`);
        }
      }
      throw lastError ?? new Error("all search engines failed");
    },
  };

  installSettingsSection(ctx, FREE_SEARCH_NS, Config, config ?? {}, {
    setSource: (source) => {
      current = source;
    },
    onChange: () => {
      // settings 变更时刷新系统提示词（显示最新引擎）
      if (typeof refreshPrompt === "function") refreshPrompt();
    },
  });

  ctx.inject(["webServer", "settings"], (sctx) => {
    sctx.effect(() => {
      const disposers = makeBridgeRoutes(
        sctx.settings,
        (request) => provider.search(request, undefined),
        (engine, query, timeRange) => runEngineTest(engine, query, timeRange)
      ).map((route) => sctx.webServer.register(route));
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, "free-search: settings bridge");
  });

  ctx.web.registerSearchProvider(provider);

  // 测试工具：让 agent 逐个测试所有搜索引擎，报告可用性
  const runEngineTest = async (engine, query, timeRange) => {
    const cfg = current();
    const q = query || "DeepSeek Harness";
    const tr = parseTimeRange(timeRange);
    const attempt = async () => {
      switch (engine) {
        case "ddg":
          return await searchDdgHtml(q, 2, { ...cfg, timeRange: tr });
        case "ddg-lite":
          return await searchDdgLite(q, 2, { ...cfg, timeRange: tr });
        case "bing":
          return await searchBing(q, 2, cfg);
        case "searxng":
          return await searchSearxng(q, 2, { ...cfg, timeRange: tr });
        case "anysearch":
          return await searchAnysearch(q, 2);
        case "exa": {
          const key = await resolveApiKey("EXA_API_KEY", "exaApiKey");
          if (key) return await searchExa(q, 2, key, tr);
          return await searchExaMCP(q, 2);
        }
        case "tavily": {
          const key = await resolveApiKey("TAVILY_API_KEY", "tavilyApiKey");
          return await searchTavily(q, 2, key, tr);
        }
        case "keenable": {
          const key = await resolveApiKey("KEENABLE_API_KEY", "keenableApiKey");
          return await searchKeenable(q, 2, key, tr);
        }
        case "perplexity": {
          const key = await resolveApiKey("PERPLEXITY_API_KEY", "perplexityApiKey");
          if (!key) return { ok: false, error: "PERPLEXITY_API_KEY not configured" };
          return await searchPerplexity(q, 2, key);
        }
        case "deepseek-official": {
          const key = await resolveApiKey("DEEPSEEK_API_KEY", "deepseekApiKey");
          if (!key) return { ok: false, error: "DEEPSEEK_API_KEY not configured" };
          return await searchDeepSeekOfficial(q, 2, key);
        }
        default:
          return { ok: false, error: `unknown engine: ${engine}` };
      }
    };
    try {
      const result = await attempt();
      // 付费引擎无 key：直接透传失败结果
      if (result.ok === false) return result;
      // 免费引擎偶发反爬/空结果时重试一次
      if (result.sources && result.sources.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return await attempt();
      }
      return { ok: true, sources: result.sources ?? [], truncated: result.truncated ?? false };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  ctx.inject(["tools"], (sctx) => {
    sctx.effect(() => {
      const dispose = sctx.tools.register(
        defineTool({
          name: "free_search_test",
          description:
            "Test every configured web search engine and report which ones work. Use this to verify engine availability, diagnose search failures, or check whether an API key is configured.",
          parameters: {
            engines: {
              type: "array",
              description: "Which engines to test (default: all). Options: ddg, ddg-lite, bing, searxng, anysearch, exa, tavily, keenable, perplexity, deepseek-official.",
              items: { type: "string" },
            },
            query: {
              type: "string",
              description: "Optional search query to use for the test (default: 'DeepSeek Harness').",
            },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      engine: { type: "string" },
                      status: { type: "string" },
                      results: { type: "number" },
                      error: { type: "string" },
                      sampleTitle: { type: "string" },
                      sampleUrl: { type: "string" },
                    },
                  },
                },
              },
            },
            render(args, value) {
              const lines = value.results.map((r) => {
                if (r.status === "ok") {
                  return `- ${r.engine}: OK (${r.results} results${r.sampleTitle ? `, e.g. "${r.sampleTitle.slice(0, 40)}"` : ""})`;
                }
                return `- ${r.engine}: FAIL - ${r.error}`;
              });
              return `Search engine test:\n${lines.join("\n")}`;
            },
          },
          async execute(args) {
            const engines = args.engines && args.engines.length > 0 ? args.engines : ALL_ENGINES;
            const results = [];
            for (const engine of engines) {
              const r = await runEngineTest(engine, args.query);
              if (r.ok) {
                const item = {
                  engine,
                  status: "ok",
                  results: r.sources.length,
                };
                if (r.sources[0]?.title) item.sampleTitle = String(r.sources[0].title);
                if (r.sources[0]?.url) item.sampleUrl = String(r.sources[0].url);
                results.push(item);
              } else {
                results.push({ engine, status: "fail", error: r.error ?? "unknown error" });
              }
            }
            return { results };
          },
          finalizeContent(exec, result) {
            // 把 render 输出包装成合法的 text block（content 必须是 block 数组）
            const text = result.content;
            if (typeof text === "string" && text.length > 0) {
              return [{ type: "text", text }];
            }
            return undefined;
          },
        })
      );
      return () => {
        dispose();
      };
    }, "free-search: test engines tool");
  });

  // 平台搜索工具：GitHub / V2EX / Bilibili（公开 API，零依赖）
  ctx.inject(["tools"], (sctx) => {
    sctx.effect(() => {
      const dispose = sctx.tools.register(
        defineTool({
          name: "platform_search",
          description:
            "Search a specific platform (GitHub / V2EX / Bilibili) for a query. Returns source URLs with titles and snippets. Use this when the user asks about repos, code, forum threads, or videos.",
          parameters: {
            platform: {
              type: "string",
              description: "Platform to search: github, v2ex, bilibili",
            },
            query: {
              type: "string",
              description: "The search query.",
            },
            maxResults: {
              type: "number",
              description: "Optional result count (default 5, max 10).",
            },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                platform: { type: "string" },
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      url: { type: "string" },
                      title: { type: "string" },
                      snippet: { type: "string" },
                    },
                  },
                },
              },
            },
            render(args, value) {
              const lines = value.sources.map((s, i) => `- [${s.title ?? s.url}](${s.url})${s.snippet ? ` - ${s.snippet.slice(0, 120)}` : ""}`);
              return `Platform search (${value.platform}):\n${lines.join("\n") || "No results found."}`;
            },
          },
          async execute(args) {
            const platform = args.platform;
            if (!PLATFORMS[platform]) {
              throw new Error(`unknown platform "${platform}" - use one of: ${Object.keys(PLATFORMS).join(", ")}`);
            }
            // 平台开关：settings 里禁用某平台时，工具明确告知
            const enabled = current().platforms ?? ["github", "v2ex", "bilibili"];
            if (!enabled.includes(platform)) {
              throw new Error(
                `platform "${platform}" is disabled in Free Search settings - enable it in Settings > Plugins > Free Search to use it`
              );
            }
            const limit = Math.min(args.maxResults ?? 5, 10);
            const result = await searchPlatform(platform, args.query, limit);
            return { platform, sources: result.sources };
          },
          finalizeContent(exec, result) {
            // Tool-result content must be an array of content blocks, not a raw string.
            const text = result.content;
            return typeof text === "string" && text.length > 0 ? [{ type: "text", text }] : undefined;
          },
        })
      );
      return () => {
        dispose();
      };
    }, "free-search: platform search tool");
  });

  // 高级搜索工具：支持时间过滤（time_range）和指定引擎（engine）。
  // 走与 web_search 相同的统一回退链，但允许 agent 显式请求"最近 N 天"的结果。
  ctx.inject(["tools"], (sctx) => {
    sctx.effect(() => {
      const dispose = sctx.tools.register(
        defineTool({
          name: "advanced_search",
          description:
            "Search the web with optional time filtering. Use when the user wants results from a specific time window (e.g. 'last week', 'this month') or when you need to force a specific engine. Falls back across engines automatically just like web_search.",
          parameters: {
            query: {
              type: "string",
              description: "The search query.",
            },
            maxResults: {
              type: "number",
              description: "Optional result count (default 5, max 10).",
            },
            timeRange: {
              type: "string",
              description: "Optional time filter. Fixed tiers: day, week, month, year. Custom: relative like 12h, 3d, 2mo, 1y, or an absolute date like 2026-07-01 (published after that date). Exa/Keenable apply it precisely; Tavily/SearXNG/DDG map to the nearest tier.",
            },
            engine: {
              type: "string",
              description: "Optional specific engine to try first: ddg, ddg-lite, bing, searxng, anysearch, exa, tavily, keenable, perplexity, deepseek-official.",
            },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                provider: { type: "string" },
                content: { type: "string" },
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      url: { type: "string" },
                      title: { type: "string" },
                      snippet: { type: "string" },
                      publishedAt: { type: "string" },
                    },
                  },
                },
              },
            },
            render(args, value) {
              const lines = value.sources.map((s, i) => `- [${s.title ?? s.url}](${s.url})${s.snippet ? ` - ${s.snippet.slice(0, 120)}` : ""}${s.publishedAt ? ` (${s.publishedAt})` : ""}`);
              return `Search (${value.provider}${args.timeRange ? `, timeRange=${args.timeRange}` : ""}):\n${lines.join("\n") || "No results found."}${value.content ? `\n\n${value.content}` : ""}`;
            },
          },
          async execute(args) {
            const request = {
              query: args.query,
              maxResults: Math.min(args.maxResults ?? 5, 10),
            };
            if (parseTimeRange(args.timeRange) !== undefined) request.timeRange = args.timeRange;
            // engine 指定时：仅当该引擎可用才优先（仍走回退链，失败自动换引擎）
            if (args.engine && ALL_ENGINES.includes(args.engine)) request.engine = args.engine;
            const result = await provider.search(request);
            return {
              provider: result.provider ?? result._provider,
              content: result.content ?? "",
              sources: (result.sources ?? []).map((s) => ({
                url: s.url,
                title: s.title,
                snippet: s.snippet,
                publishedAt: s.publishedAt,
              })),
            };
          },
          finalizeContent(exec, result) {
            // Tool-result content must be an array of content blocks, not a raw string.
            const text = result.content;
            return typeof text === "string" && text.length > 0 ? [{ type: "text", text }] : undefined;
          },
        })
      );
      return () => {
        dispose();
      };
    }, "free-search: advanced search tool");
  });

  // 让 agent 知道可用搜索引擎（动态生成，随 key/设置变化）
  ctx.inject(["systemPrompt"], (sctx) => {
    let disposeSection = null;
    refreshPrompt = () => {
      if (disposeSection) {
        disposeSection();
        disposeSection = null;
      }
      disposeSection = sctx.systemPrompt.section({
        name: "free-search:engines",
        order: 500,
        text: [
          "## Available web search engines (free-search plugin)",
          "",
          "You have the web_search tool. Its backend engine is chosen in Settings > Plugins > Free Search.",
          "Current engine: " + (current().provider ?? "bing"),
          "",
          "Available engines and their requirements:",
          "- ddg (DuckDuckGo HTML) - FREE, no key (may be rate-limited)",
          "- ddg-lite (DuckDuckGo Lite) - FREE, no key (may be rate-limited)",
          "- bing (Bing) - FREE, no key (most stable)",
          "- searxng (meta-search, multi-instance) - FREE, no key",
          "- anysearch (AI search) - FREE, no key",
          "- exa - FREE keyless (MCP) or EXA_API_KEY for higher limits",
          "- tavily - FREE keyless or TAVILY_API_KEY for higher limits",
          "- keenable - FREE keyless (MCP) or KEENABLE_API_KEY for higher limits",
          "- perplexity - requires PERPLEXITY_API_KEY",
          "- deepseek-official - requires DEEPSEEK_API_KEY",
          "",
          "IMPORTANT: If the configured engine fails (missing key, invalid key, 401, rate limit, or network error), web_search automatically tries other engines in this order: (1) other PAID engines whose API key is configured, (2) then FREE engines (Bing, AnySearch, DuckDuckGo, SearXNG). This applies to ALL engines - paid or free. The results include a note showing which engine was actually used. Never tell the user search is unavailable - it always falls back.",
          "",
          "Use the free_search_test tool to test which engines actually work right now.",
          "",
          "When the user wants results from a specific time window (e.g. 'last week', 'this month', 'last 3 days'), use the advanced_search tool with timeRange. Fixed tiers: day|week|month|year. Custom: 12h, 3d, 2mo, 1y, or an absolute date like 2026-07-01.",
          "",
          "For platform-specific searches (GitHub repos, V2EX threads, Bilibili videos), use the platform_search tool with platform: github|v2ex|bilibili.",
          "",
          "The user can switch the search engine themselves by typing /free-search-engine in the chat — it opens a picker to choose an engine, just like the settings page. This changes the preferred engine; search still falls back to other engines automatically if it fails. You should not switch engines on your own; let the user decide.",
        ].join("\n"),
      });
    };
    sctx.effect(() => {
      refreshPrompt();
      return () => {
        if (disposeSection) disposeSection();
        disposeSection = null;
      };
    }, "free-search: engine list prompt section");
  });
}

export {
  ALL_ENGINES,
  ANYSEARCH_URL,
  BING_URL,
  Config,
  DDG_HTML_URL,
  DDG_LITE_URL,
  EXA_MCP_URL,
  FREE_ENGINES,
  FREE_SEARCH_NS,
  KEENABLE_MCP_URL,
  KEENABLE_URL,
  PLATFORMS,
  SEARXNG_INSTANCES,
  TAVILY_URL,
  TIME_RANGES,
  apply,
  approximateTimeRange,
  formatKeenableRelative,
  inject,
  name,
  parseTimeRange,
  searchAnysearch,
  searchBing,
  searchBilibili,
  searchDeepSeekOfficial,
  searchDdgHtml,
  searchDdgLite,
  searchExa,
  searchExaMCP,
  searchGithub,
  searchKeenable,
  searchKeenableMCP,
  searchKeenableREST,
  searchPerplexity,
  searchPlatform,
  searchReddit,
  searchSearxng,
  searchTavily,
  searchV2ex,
};
