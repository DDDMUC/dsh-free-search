import { SettingsConflictError, SettingsProvider } from "@deepseek-ai/dsh-settings";
import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const DDG_LITE_URL = "https://lite.duckduckgo.com/lite/";
const BING_URL = "https://www.bing.com/search";
const TAVILY_URL = "https://api.tavily.com/search";
const KEENABLE_URL = "https://api.keenable.ai/v1/search";
const KEENABLE_MCP_URL = "https://api.keenable.ai/mcp";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ACCEPT_LANG = "zh-CN,zh;q=0.9,en;q=0.8";

const FREE_SEARCH_NS = "free-search";
const BRIDGE_PREFIX = "/api/dsh-free-search-settings";
const FREE_ENGINES = ["ddg", "ddg-lite", "bing", "searxng", "anysearch"];
const ALL_ENGINES = ["ddg", "ddg-lite", "bing", "searxng", "anysearch", "exa", "tavily", "keenable", "perplexity", "deepseek-official"];

// 褰撳墠鎻掍欢鐗堟湰锛堝彂甯冩椂涓?package.json 鍚屾锛?
const PLUGIN_VERSION = "0.4.20";
// 妫€鏌ユ洿鏂扮殑 npm registry 鍏冩暟鎹湴鍧€锛坉sh-free-search 鏄?npmjs 涓婄殑鍏紑鍖咃級
const NPM_REGISTRY_URL = "https://registry.npmjs.org/dsh-free-search/latest";
const PLUGIN_NPM_URL = "https://www.npmjs.com/package/dsh-free-search";
const PLUGIN_REPO_URL = "https://github.com/DDDMUC/dsh-free-search";

// 鏌ヨ npm registry 鐨勬渶鏂扮増鏈紱澶辫触鏃惰繑鍥?null锛堢綉缁?浠ｇ悊闂涓嶉樆濉炶缃〉锛?
async function fetchLatestVersion(signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const response = await fetch(NPM_REGISTRY_URL, {
      headers: { accept: "application/json", "user-agent": "deepseek-harness/free-search" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// 绠€鍗曠殑 semver 姣旇緝锛堜粎澶勭悊 x.y.z 涓?娆?琛ヤ竵锛屽拷鐣ラ鍙戝竷鏍囩锛夛紱a>b 杩斿洖 1, a<b 杩斿洖 -1, 鐩哥瓑杩斿洖 0
function compareVersions(a, b) {
  const na = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const nb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((na[i] ?? 0) > (nb[i] ?? 0)) return 1;
    if ((na[i] ?? 0) < (nb[i] ?? 0)) return -1;
  }
  return 0;
}

// 妫€娴嬫彃浠剁殑瀹夎妯″紡锛氶亶鍘?profiles/*/node_modules/dsh-free-search锛?
// symlink锛坙ink: 鏈湴寮€鍙戯級鈫?isLink=true锛沶pm 鐪熷畨瑁?鈫?isLink=false锛涙壘涓嶅埌 鈫?null
function detectInstallMode() {
  const profilesDir = path.join(process.cwd(), "profiles");
  let found = null;
  try {
    for (const name of fs.readdirSync(profilesDir)) {
      const pkgPath = path.join(profilesDir, name, "node_modules", "dsh-free-search");
      if (!fs.existsSync(pkgPath)) continue;
      let isLink = false;
      try {
        isLink = fs.lstatSync(pkgPath).isSymbolicLink();
      } catch {}
      found = { profileDir: path.join(profilesDir, name), isLink };
      break;
    }
  } catch {}
  return found;
}

// time_range 鏀寔锛氬浐瀹氭。 day/week/month/year锛屾垨鑷畾涔夛紙鐩稿 12h/3d/2mo/1y銆佺粷瀵?YYYY-MM-DD锛?
const TIME_RANGES = ["day", "week", "month", "year"];
const DAYS_BY_RANGE = { day: 1, week: 7, month: 30, year: 365 };
const KEENABLE_REL = { day: "1d", week: "7d", month: "1mo", year: "1y" };
const SEARXNG_TIME = { day: "day", week: "week", month: "month", year: "year" };

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

// 鎶婄敤鎴?agent 缁欑殑 timeRange 瑙ｆ瀽鎴愮粺涓€瀵硅薄锛歿 days } 鐩稿澶╂暟锛屾垨 { after } 缁濆鏃ユ湡銆?
// 杈撳叆鏀寔锛歞ay/week/month/year銆?2h/3d/2mo/1y銆?026-07-01锛屾垨宸茶В鏋愮殑 {days}/{after} 瀵硅薄銆?
// 鏃犳晥杩斿洖 undefined銆?
function parseTimeRange(input) {
  if (input === undefined || input === null) return undefined;
  // 宸茶В鏋愬璞★細鐩存帴閫忎紶
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

// 鎶婅嚜瀹氫箟澶╂暟鏄犲皠鍒板彧鏀寔鍥哄畾妗ｇ殑寮曟搸锛圱avily / SearXNG / DDG锛夌殑鏈€杩戜技妗ｄ綅
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

//#region 缁撴灉缂撳瓨锛堥槻闄愭祦/鐪侀搴︼紝LRU 50 鏉★紝TTL 鍙厤缃?0-5 鍒嗛挓锛?
const CACHE_MAX_ENTRIES = 50;
// fallback 鏉＄洰锛堝疄闄呭紩鎿?鈮?棣栭€夊紩鎿庢椂锛塗TL = 閰嶇疆 TTL 鐨?1/5锛堥粯璁?5 鍒嗛挓 鈫?60s锛夛細
// 棣栭€夊紩鎿庢仮澶嶅悗鏈€澶?1 鍒嗛挓鍗冲彲鎷垮埌鏂扮粨鏋滐紝閬垮厤鍥為€€缁撴灉琚畬鏁?TTL 閽夋锛涢閫夋垚鍔熸潯鐩粛鐢ㄥ畬鏁?TTL銆?

function buildCacheKey(query, maxResults, timeRangeLabel, preferred) {
  return [query ?? "", maxResults ?? 5, timeRangeLabel ?? "", preferred].join("\u0000");
}
//#endregion

// 缁熶竴鐨?snippet 娓呮礂锛氬墧闄ょ櫥褰?浠樿垂澧?璁㈤槄绛夊櫔闊崇煭璇紝鎶樺彔绌虹櫧锛岄檺鍒堕暱搴︺€?
// 鍙湪鍥為€€閾惧嚭鍙ｇ粺涓€搴旂敤锛屽悇寮曟搸鍐呴儴涓嶅仛锛岄伩鍏嶉噸澶嶅鐞嗐€?
const SNIPPET_NOISE =
  /\b(sign up|sign in|log in|login|subscribe( to| for)?|member[- ]?only|become a member|create (a )?free account|read more|continue reading|story continues|get started|install (the )?app|view on|medium membership|join \w+ for free|get updates from this writer|stories in your inbox|remember me for|unlock this|free to read|become a patron)\b/gi;

function cleanSnippet(text) {
  if (!text) return text;
  return String(text)
    .replace(SNIPPET_NOISE, " ")
    .replace(/^\s*(#{1,6}\s*|\[\s*x?\s*\]\s*|-\s*\[\s*x?\s*\]\s*|>\s*)/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
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
  // 鍗曟璇锋眰瓒呮椂 12s锛岄伩鍏嶆寕璧疯褰撴垚 Connection error
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
  // DuckDuckGo 鍙嶇埇楠岃瘉椤垫娴嬶紙HTTP 202 鎴栭獙璇佸叧閿瓧锛?
  if (response.status === 202 || /anomaly|captcha|unusual traffic|robot check/i.test(html.slice(0, 4000))) {
    throw new Error("DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary) - Bing works");
  }
  return html;
}

// 甯﹂噸璇曠殑鎶撳彇锛氱綉缁滈敊璇?绌虹粨鏋滄椂閲嶈瘯锛岄棿闅?1.5s锛屾渶澶?3 娆?
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
  // DDG 瀹夊叏鎼滅储锛歰ff(adlt=-1) / moderate(adlt=0) / strict(adlt=1)
  const adlt = options?.safeSearch ?? "off";
  params.set("adlt", adlt === "strict" ? "1" : adlt === "moderate" ? "0" : "-1");
  // DDG 鏃堕棿杩囨护锛歞f=d/w/m/y锛堝彧鏀寔鍥哄畾妗ｏ紝鑷畾涔夊彇杩戜技妗ｏ級
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
  const adlt = options?.safeSearch ?? "off";
  params.set("adlt", adlt === "strict" ? "1" : adlt === "moderate" ? "0" : "-1");
  // DDG Lite 鍚屾牱鏀寔 df 鏃堕棿杩囨护
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
  const adlt = options?.safeSearch ?? "off";
  if (adlt === "off") params.set("adlt", "off");
  else if (adlt === "moderate") params.set("adlt", "moderate");
  else if (adlt === "strict") params.set("adlt", "strict");
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
  // 鑱氬悎鎵€鏈夊疄渚嬬殑澶辫触鍘熷洜锛岄伩鍏嶅彧鏄剧ず鏈€鍚庝竴涓疄渚嬬殑閿欒
  const errors = [];
  for (const base of instances) {
    try {
      const params = new URLSearchParams({ q: query, format: "json" });
      // SearXNG 鍘熺敓鏀寔 time_range 杩囨护锛堝彧鏀寔鍥哄畾妗ｏ紝鑷畾涔夊彇杩戜技妗ｏ級
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
  // 绌哄疄渚嬪垪琛ㄥ厹搴曪細閬垮厤 "all SearXNG instances failed: " 灏惧反鎮┖
  const detail = errors.length > 0 ? errors.join(", ") : "no instances configured";
  // Note 浼氬紩鐢ㄨ繖涓敊璇秷鎭紝鎴柇閬垮厤 6 瀹炰緥鍏ㄦ寕鏃跺埛灞?
  throw new Error(`all SearXNG instances failed: ${detail.slice(0, 300)}`);
}
//#endregion

//#region keyless engines (AnySearch / Exa MCP - free, no API key)
const ANYSEARCH_URL = "https://api.anysearch.com/v1/search";
const EXA_MCP_URL = "https://mcp.exa.ai/mcp";

// AnySearch: 鍏嶈垂鍖垮悕棰濆害锛堟棤 key锛夛紝缁撴瀯鍖?JSON 缁撴灉
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

// Exa MCP: 鍖垮悕鍏紑 MCP锛堟棤 key锛夛紝web_search_exa 宸ュ叿
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
  // 瑙ｆ瀽 SSE 鏍煎紡锛歟vent: message\ndata: {...}
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
  // 瑙ｆ瀽 "Title: X\nURL: Y\nPublished: Z\nHighlights:\n..."
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
      // 鍙繚鐣欐棩鏈熷舰鎬侊紙ISO 鎴?YYYY-MM-DD锛夛紝杩囨护 "N/A" 绛夊崰浣嶇
      ...(published && /^\d{4}-\d{2}-\d{2}/.test(published) ? { publishedAt: published } : {}),
    });
  }
  return { sources, truncated: false };
}
//#endregion

//#region platform search (GitHub / V2EX / Bilibili / Reddit / HN / StackOverflow / Wikipedia / npm)
const PLATFORMS = {
  github: { name: "GitHub" },
  v2ex: { name: "V2EX" },
  bilibili: { name: "Bilibili" },
  reddit: { name: "Reddit" },
  hn: { name: "Hacker News" },
  stackoverflow: { name: "Stack Overflow" },
  wikipedia: { name: "Wikipedia" },
  npm: { name: "npm" },
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
      snippet: `${item.description ?? ""}${item.stargazers_count ? ` 猸?{item.stargazers_count}` : ""}`.trim(),
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

async function searchHackerNews(query, maxResults, signal) {
  const response = await fetch(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${maxResults ?? 5}`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      ...(signal !== undefined ? { signal } : {}),
    }
  );
  if (!response.ok) throw new Error(`Hacker News API error (HTTP ${response.status})`);
  const data = await response.json();
  return {
    sources: (data.hits ?? [])
      .filter((h) => h.title || h.story_title)
      .map((h) => ({
        // 鏈夊閾剧敤澶栭摼锛岀函璁ㄨ甯栫敤 HN 璁ㄨ椤?
        url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
        title: h.title ?? h.story_title,
        ...((h.points !== undefined && h.points !== null) || (h.num_comments !== undefined && h.num_comments !== null)
          ? { snippet: `HN discussion 路 ${h.points ?? 0} points 路 ${h.num_comments ?? 0} comments` }
          : {}),
      })),
    truncated: false,
  };
}

async function searchStackOverflow(query, maxResults, signal) {
  const response = await fetch(
    `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=${maxResults ?? 5}&filter=!nNPvSNVZJS`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      ...(signal !== undefined ? { signal } : {}),
    }
  );
  if (!response.ok) throw new Error(`Stack Exchange API error (HTTP ${response.status})`);
  const data = await response.json();
  if (data.error_message) throw new Error(`Stack Exchange API error: ${data.error_message}`);
  return {
    sources: (data.items ?? []).map((it) => ({
      url: it.link,
      title: it.title,
      ...(it.score !== undefined || it.answer_count !== undefined
        ? { snippet: `${it.is_answered ? "鉁?answered" : "unanswered"} 路 score ${it.score ?? 0} 路 ${it.answer_count ?? 0} answers` }
        : {}),
    })),
    truncated: false,
  };
}

async function searchWikipedia(query, maxResults, signal, lang) {
  const host = lang === "en" ? "en.wikipedia.org" : "zh.wikipedia.org";
  const response = await fetch(
    `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${maxResults ?? 5}`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      ...(signal !== undefined ? { signal } : {}),
    }
  );
  if (!response.ok) throw new Error(`Wikipedia API error (HTTP ${response.status})`);
  const data = await response.json();
  return {
    sources: (data.query?.search ?? []).map((s) => ({
      url: `https://${host}/wiki/${encodeURIComponent(String(s.title).replace(/ /g, "_"))}`,
      title: s.title,
      // snippet 鍚?<span class="searchmatch"> 楂樹寒鏍囩锛屽墺鎺?
      ...(s.snippet ? { snippet: stripTags(s.snippet).slice(0, 200) } : {}),
    })),
    truncated: false,
  };
}

async function searchNpm(query, maxResults, signal) {
  const response = await fetch(
    `https://registry.npmjs.com/-/v1/search?text=${encodeURIComponent(query)}&size=${maxResults ?? 5}`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      ...(signal !== undefined ? { signal } : {}),
    }
  );
  if (!response.ok) throw new Error(`npm registry API error (HTTP ${response.status})`);
  const data = await response.json();
  return {
    sources: (data.objects ?? [])
      .map((o) => o.package)
      .filter((p) => p && p.name)
      .map((p) => ({
        url: p.links?.npm ?? `https://www.npmjs.com/package/${p.name}`,
        title: p.name,
        ...((p.description || p.version)
          ? { snippet: `v${p.version ?? "?"}${p.description ? ` 鈥?${String(p.description).slice(0, 160)}` : ""}` }
          : {}),
      })),
    truncated: false,
  };
}

async function searchPlatform(platform, query, maxResults, signal, lang) {
  switch (platform) {
    case "github":
      return searchGithub(query, maxResults, signal);
    case "v2ex":
      return searchV2ex(query, maxResults, signal);
    case "bilibili":
      return searchBilibili(query, maxResults, signal);
    case "reddit":
      return searchReddit(query, maxResults, signal);
    case "hn":
      return searchHackerNews(query, maxResults, signal);
    case "stackoverflow":
      return searchStackOverflow(query, maxResults, signal);
    case "wikipedia":
      return searchWikipedia(query, maxResults, signal, lang);
    case "npm":
      return searchNpm(query, maxResults, signal);
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
  // Exa 鏃堕棿杩囨护锛歴tartPublishedDate锛圛SO 鏃ユ湡锛涙敮鎸佷换鎰忓ぉ鏁板拰缁濆鏃ユ湡锛?
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

// Tavily: 鏃?key 璧?keyless锛堝厤璐瑰尶鍚嶉搴︼級锛屾湁 key 璧拌处鍙锋。锛圔earer锛?
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
    // Tavily 鏃堕棿杩囨护锛歵ime_range 鍙敮鎸佸浐瀹氭。锛岃嚜瀹氫箟澶╂暟鍙栨渶杩戜技妗ｄ綅
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

// 鎶婁换鎰忓ぉ鏁拌浆鎴?Keenable 鐨勭浉瀵规椂闂存牸寮忥紙12h / Nd / Nmo / Ny锛?
function formatKeenableRelative(days) {
  if (days <= 0.5) return "12h";
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

// Keenable: 鏈?key 璧?REST API锛圶-API-Key锛夛紝鏃?key 璧?keyless MCP锛堝厤璐瑰尶鍚嶉搴︼級
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
      // 涓?Exa MCP 涓€鑷达細鍙繚鐣欐棩鏈熷舰鎬侊紝杩囨护 "N/A" 绛夊崰浣嶇
      ...(published && /^\d{4}-\d{2}-\d{2}/.test(published) ? { publishedAt: published } : {}),
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
    // Keenable 鏃堕棿杩囨护锛歱ublished_after锛堢浉瀵?12h/7d/1mo/1y 鎴栫粷瀵?YYYY-MM-DD锛?
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
    // Keenable MCP 鏀寔 published_after锛堢浉瀵规垨缁濆鏃ユ湡锛?
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
  // isError=true 鏃?content 閲屾槸閿欒鏂囨湰
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
  // 鍐呯疆 20s 瓒呮椂锛堜笌澶栭儴 signal 缁勫悎锛夛細璋冪敤鏂逛笉浼?signal 鏃朵篃涓嶄細姘镐箙鍗′綇
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
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(20000)]),
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
  // 鍐呯疆 20s 瓒呮椂锛堜笌澶栭儴 signal 缁勫悎锛夛細璋冪敤鏂逛笉浼?signal 鏃朵篃涓嶄細姘镐箙鍗′綇
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
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(20000)]),
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

function makeBridgeRoutes(settings, search, testEngine, getCredentials) {
  const allowlisted = () =>
    settings
      .describe({ redactSecrets: true })
      .filter((descriptor) => String(descriptor.ns) === FREE_SEARCH_NS)
      .map((descriptor) => String(descriptor.ns));

  const handlers = {
    async checkUpdate() {
      const latest = await fetchLatestVersion();
      if (latest === null) {
        return {
          ok: false,
          code: "update-check-failed",
          message: "could not reach the npm registry (network/proxy) - check your connection",
        };
      }
      const cmp = compareVersions(latest, PLUGIN_VERSION);
      const mode = detectInstallMode();
      return {
        ok: true,
        value: {
          current: PLUGIN_VERSION,
          latest,
          hasUpdate: cmp > 0,
          updateUrl: PLUGIN_NPM_URL,
          repoUrl: PLUGIN_REPO_URL,
          // 鍙竴閿崌绾э細npm 鐪熷畨瑁呮椂 true锛涙湰鍦?link 寮€鍙戞ā寮?false锛堝崌绾ц git pull 婧愮爜锛?
          installable: mode !== null && !mode.isLink,
          installMode: mode?.isLink ? "link" : mode !== null ? "registry" : "unknown",
        },
      };
    },
    // 涓€閿崌绾э細浠呭湪 npm 鐪熷畨瑁呮ā寮忎笅鎵ц pnpm 鍗囩骇锛沴ink 妯″紡鎷掔粷锛堥伩鍏嶇牬鍧忔湰鍦板紑鍙戦摼璺級
    async updatePlugin() {
      const mode = detectInstallMode();
      if (mode === null) {
        return { ok: false, code: "install-not-found", message: "could not locate dsh-free-search in any profile" };
      }
      if (mode.isLink) {
        return {
          ok: false,
          code: "local-link-mode",
          message: "local development install (symlink) - update the source repo instead (git pull), then restart dsh",
        };
      }
      try {
        const result = await new Promise((resolve, reject) => {
          exec("pnpm add dsh-free-search@latest", { cwd: mode.profileDir, timeout: 120000 }, (error, stdout, stderr) => {
            if (error) reject(new Error(`upgrade failed: ${(stderr || stdout || error.message).trim().slice(0, 300)}`));
            else resolve(stdout);
          });
        });
        const latest = await fetchLatestVersion();
        return {
          ok: true,
          value: {
            updated: true,
            latest: latest ?? "unknown",
            message: `upgraded to latest - restart dsh to apply`,
            output: String(result).trim().slice(0, 200),
          },
        };
      } catch (error) {
        return { ok: false, code: "upgrade-failed", message: error instanceof Error ? error.message : String(error) };
      }
    },
    async rawSearch(request) {
      if (request === null || typeof request !== "object" || typeof request.query !== "string" || request.query.length === 0) {
        return { ok: false, code: "search-rejected", message: "malformed bridge search request (query is required)" };
      }
      const maxResults = Math.min(Math.max(Number(request.maxResults) || 5, 1), 10);
      const timeRange = parseTimeRange(request.timeRange);
      // 鎸囧畾 engine锛氱洿娴嬭寮曟搸鏈韩锛堜笉璧板洖閫€閾撅級锛屾姤鍛婂畠鑷繁鐨勫彲鐢ㄦ€?
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
            // 瀹為檯浣跨敤鐨勫紩鎿庯細provider.search 鍦ㄦ垚鍔熸椂杩斿洖 provider 瀛楁
            provider: result.provider ?? request.engine ?? request.provider ?? "bing",
            sources: result.sources ?? [],
            content: result.content ?? "",
            // 缂撳瓨鍛戒腑鏍囪锛歱rovider.search 鎴愬姛璺緞鏍囪 _cache锛坔it=鍛戒腑缂撳瓨锛宮iss=鐪熷疄鎼滅储锛?
            cache: result._cache === "hit" ? "hit" : "miss",
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
        await settings.mutate(ns, body.ops, expectedRevision);
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
    // 鍑嵁涓績锛氭煡璇㈠悇寮曟搸 key 鐨勯厤缃姸鎬侊紙value 涓嶈繑鍥烇紝鍙繑鍥炴槸鍚﹀凡閰嶇疆锛?
    async credentialsStatus() {
      const credentials = getCredentials();
      if (!credentials) return { ok: false, code: "credentials-unavailable", message: "credentials service is not available" };
      const configured = {};
      for (const [settingsKey, ref] of Object.entries(KEY_REF_MAP)) {
        try {
          const info = await credentials.describe(ref);
          configured[settingsKey] = info !== undefined && info.configured === true;
        } catch {
          configured[settingsKey] = false;
        }
      }
      return { ok: true, value: { configured, available: true } };
    },
    // 鍑嵁涓績锛氬啓鍏ヤ竴涓紩鎿?key锛坮ef 鐧藉悕鍗曢檺瀹氾級
    async credentialsSet(request) {
      const credentials = getCredentials();
      if (!credentials) return { ok: false, code: "credentials-unavailable", message: "credentials service is not available" };
      const { key, value } = request ?? {};
      const ref = KEY_REF_MAP[key];
      if (!ref) return { ok: false, code: "credentials-rejected", message: `unknown credential key "${key}"` };
      if (typeof value !== "string" || value.trim().length === 0) {
        return { ok: false, code: "credentials-rejected", message: "value is required" };
      }
      try {
        await credentials.set(ref, value.trim());
        return { ok: true, value: { ref, set: true } };
      } catch (error) {
        return { ok: false, code: "credentials-write-failed", message: error instanceof Error ? error.message : String(error) };
      }
    },
    // 鍑嵁涓績锛氬垹闄や竴涓紩鎿?key
    async credentialsUnset(request) {
      const credentials = getCredentials();
      if (!credentials) return { ok: false, code: "credentials-unavailable", message: "credentials service is not available" };
      const { key } = request ?? {};
      const ref = KEY_REF_MAP[key];
      if (!ref) return { ok: false, code: "credentials-rejected", message: `unknown credential key "${key}"` };
      try {
        await credentials.unset(ref);
        return { ok: true, value: { ref, set: false } };
      } catch (error) {
        return { ok: false, code: "credentials-write-failed", message: error instanceof Error ? error.message : String(error) };
      }
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
      path: `${BRIDGE_PREFIX}/credentials-status`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        writeJson(res, 200, await handlers.credentialsStatus());
      },
    },
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/credentials-set`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        const body = await readJsonBody(req);
        if (body === undefined) {
          writeJson(res, 400, { ok: false, code: "credentials-rejected", message: "malformed JSON body" });
          return;
        }
        writeJson(res, 200, await handlers.credentialsSet(body));
      },
    },
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/credentials-unset`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        const body = await readJsonBody(req);
        if (body === undefined) {
          writeJson(res, 400, { ok: false, code: "credentials-rejected", message: "malformed JSON body" });
          return;
        }
        writeJson(res, 200, await handlers.credentialsUnset(body));
      },
    },
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/check-update`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        writeJson(res, 200, await handlers.checkUpdate());
      },
    },
    {
      kind: "exact",
      path: `${BRIDGE_PREFIX}/update`,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        writeJson(res, 200, await handlers.updatePlugin());
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

// 寮曟搸 key 涓庡嚟鎹腑蹇?ref 鐨勬槧灏勶紙鐧藉悕鍗曪細鍙厑璁歌繖浜?ref 琚?UI 璇诲啓鍑嵁涓績锛?
const KEY_REF_MAP = {
  exaApiKey: "EXA_API_KEY",
  tavilyApiKey: "TAVILY_API_KEY",
  keenableApiKey: "KEENABLE_API_KEY",
  perplexityApiKey: "PERPLEXITY_API_KEY",
  deepseekApiKey: "DEEPSEEK_API_KEY",
};

const Config = z.object({
  provider: z.string().default("bing"),
  cache: z.boolean().default(true), // 鍗?query 缁撴灉缂撳瓨寮€鍏筹紙闃查檺娴?鐪侀搴︼級
  cacheTtl: z.number().default(5), // 缂撳瓨鏃堕暱锛堝垎閽燂級锛?-5 鍙厤缃紙浣跨敤澶勫啀 clamp锛?
  keyStorage: z.string().default("credentials"), // key 瀛樺偍浣嶇疆锛歝redentials锛堝嚟鎹腑蹇冿級| settings锛堣缃〉锛?
  lang: z.string().default("zh"),
  region: z.string(),
  bingMarket: z.string().default("zh-CN"),
  safeSearch: z.string().default("off"),
  searxngInstances: z.array(z.string()),
  platforms: z.array(z.string()).default(["github", "v2ex", "bilibili", "reddit", "hn", "stackoverflow", "wikipedia", "npm"]),
  exaApiKey: z.string().role("secret"),
  tavilyApiKey: z.string().role("secret"),
  keenableApiKey: z.string().role("secret"),
  perplexityApiKey: z.string().role("secret"),
  deepseekApiKey: z.string().role("secret"),
});

function apply(ctx, config) {
  let current = () => config ?? {};
  const logger = ctx.logger;
  // credentials 鏈嶅姟鍙兘鏅氫簬鏈彃浠舵寕杞斤紙璺?bundle 椤哄簭锛夛紝杩愯鏈熷姩鎬佽幏鍙栬€屼笉鏄?apply 鏃剁紦瀛?
  const getCredentials = () => ctx.get("credentials");

  // 绯荤粺鎻愮ず璇嶅姩鎬佸埛鏂帮細璁剧疆鍙樻洿鏃堕噸鏂扮敓鎴愶紝閬垮厤鏄剧ず鏃у紩鎿?
  let refreshPrompt = null;

  // 鍗?query 缁撴灉缂撳瓨锛坧rovider.search 鍐呴棴鍖呮寔鏈夛級锛歀RU 50 鏉?/ TTL 鍙厤缃?
  const searchCache = new Map(); // key -> { value, expiresAt }

  // key 浼樺厛绾э細credentials锛?credentials.yaml 鍑嵁涓績锛屽畼鏂规帹鑽愶級> settings 鐨?free-search.<x>ApiKey锛堥仐鐣欏吋瀹癸級> 鐜鍙橀噺
  const resolveApiKey = async (envName, settingsKey) => {
    const credentials = getCredentials();
    if (credentials) {
      try {
        const resolved = await credentials.resolve(envName);
        if (resolved?.value) return resolved.value;
      } catch {}
    }
    const cfg = current();
    if (settingsKey && cfg[settingsKey]) return cfg[settingsKey];
    return process.env[envName] ?? "";
  };

  // 鎬绘帶 provider锛氭寜 settings 鐨?provider 瀛楁璺敱鍒颁换鎰忓紩鎿庛€?
  // 浠讳綍寮曟搸澶辫触锛堢己 key / 401 / 闄愭祦 / 缃戠粶锛夐兘浼氳嚜鍔ㄨ疆娴佸皾璇曚笅涓€涓紩鎿庯紝
  // 鐩村埌鎴愬姛鎴栧叏閮ㄥけ璐ャ€傚苟鍦ㄧ粨鏋滈噷闄勫甫鍥為€€鎻愮ず锛岄伩鍏?agent 鎼滅储鐩存帴澶辫触銆?
  const provider = {
    id: "ddg",
    available() {
      return true;
    },
    // 鍗?query 缁撴灉缂撳瓨锛歬ey=query+maxResults+timeRangeLabel+preferred锛孧ap 澶╃劧 LRU
    async search(request, signal) {
      // 鍏叡鍜藉枆鏍￠獙锛歸eb_search / advanced_search / raw-search 涓夋潯璺緞閮界粡杩囪繖閲?
      if (request === null || typeof request !== "object" || typeof request.query !== "string" || request.query.trim().length === 0) {
        throw new Error("query is required");
      }
      const cfg = current();
      // 棣栭€夊紩鎿庯細free_search 宸ュ叿鏄惧紡鎸囧畾锛坮equest.engine锛変紭鍏堜簬璁剧疆锛坈fg.provider锛?
      const preferred =
        typeof request.engine === "string" && ALL_ENGINES.includes(request.engine)
          ? request.engine
          : cfg.provider ?? "bing";
      // time_range 杩囨护锛堜粎 advanced_search 宸ュ叿閫忎紶锛涙爣鍑?web_search 鏃犳鍙傛暟锛?
      // 淇濈暀鍘熷瀛楃涓茬敤浜?Note 灞曠ず锛況aw-search 妗ュ彲鑳藉凡鎶?timeRange 瑙ｆ瀽鎴愬璞?
      const timeRange = parseTimeRange(request.timeRange);
      const timeRangeLabel = typeof request.timeRange === "string" ? request.timeRange : String(timeRange?.days ?? timeRange?.after ?? "");

      // 缂撳瓨 TTL锛堝垎閽燂紝0-5 鍙厤缃級锛沜ache=false 鎴?ttl<=0 鏃跺畬鍏ㄧ鐢?
      const cacheTtlMs = (Math.min(Math.max(Number(cfg.cacheTtl) ?? 5, 0), 5)) * 60 * 1000;
      const cacheEnabled = cfg.cache !== false && cacheTtlMs > 0;
      const cacheKey = cacheEnabled
        ? buildCacheKey(request.query, request.maxResults, timeRangeLabel, preferred)
        : null;
      if (cacheKey !== null) {
        const hit = searchCache.get(cacheKey);
        if (hit && hit.expiresAt > Date.now()) {
          if (signal?.aborted) throw new Error("search aborted");
          searchCache.delete(cacheKey);
          searchCache.set(cacheKey, hit);
          // 娴呮嫹璐?+ 绉佹湁鏍囪锛歴ources 鏁扮粍涔熷鍒朵竴灞傦紝褰诲簳闅旂缂撳瓨瀵硅薄锛堣皟鐢ㄦ柟 push/鏀瑰厓绱犱笉褰卞搷缂撳瓨锛?
          return { ...hit.value, sources: hit.value.sources?.slice(), _cache: "hit" };
        }
        if (hit) searchCache.delete(cacheKey);
      }

      // 缁熶竴寮曟搸閾撅細棣栭€変紭鍏堬紝鐒跺悗鍏朵粬浠樿垂寮曟搸锛堟湁 key 鐨勪紭鍏堝皾璇曪級锛屾渶鍚庡厤璐瑰紩鎿?
      const paidEngines = ["exa", "tavily", "keenable", "perplexity", "deepseek-official"];
      const freeEngines = ["bing", "anysearch", "ddg", "ddg-lite", "searxng"];
      // 鏀寔 time_range 杩囨护鐨勫紩鎿庯細tavily / exa / keenable / searxng / ddg / ddg-lite
      const timeEngines = ["tavily", "exa", "keenable", "searxng", "ddg", "ddg-lite"];
      let chain;
      // 棣栭€夊紩鎿庤璺宠繃鐨勫師鍥狅紙鐢ㄤ簬鐢熸垚鍑嗙‘鐨?Note锛岄伩鍏嶈瀵?agent/鐢ㄦ埛锛夛細
      //  - "time-filter"锛氬甫 timeRange 涓旈閫夊紩鎿庝笉鏀寔鏃堕棿杩囨护锛堟牴鏈病灏濊瘯锛?
      //  - "failed"锛氶閫夊紩鎿庣‘瀹炶灏濊瘯浣嗗け璐ワ紙缂?key / 401 / 闄愭祦 / 0 缁撴灉 / 缃戠粶锛?
      //  - null锛氶閫夊紩鎿庢垚鍔熸垨鏃犲洖閫€
      let preferredSkippedReason = null;
      if (timeRange) {
        // 鏈夋椂闂磋繃婊ら渶姹傛椂锛屾妸鏀寔杩囨护鐨勫紩鎿庢帓鍓嶉潰锛堥閫夊紩鎿庤嫢鏀寔浠嶄紭鍏堬級
        const preferredFirst = [preferred].filter((e) => timeEngines.includes(e));
        const otherTime = timeEngines.filter((e) => e !== preferred);
        const noTime = [...paidEngines, ...freeEngines].filter((e) => !timeEngines.includes(e) && e !== preferred);
        chain = [...preferredFirst, ...otherTime, ...noTime];
        if (!timeEngines.includes(preferred)) {
          // 棣栭€夊紩鎿庝笉鏀寔鏃堕棿杩囨护 鈫?瀹冧笉鍦ㄩ摼閲岋紝涓嶄細琚皾璇曪紙杩欎笉绛変簬澶辫触锛?
          preferredSkippedReason = "time-filter";
        }
      } else {
        const othersPaid = paidEngines.filter((e) => e !== preferred);
        const othersFree = freeEngines.filter((e) => e !== preferred);
        chain = [preferred, ...othersPaid, ...othersFree];
      }

      let lastError = null;
      let usedEngine = null;
      // 棣栭€夊紩鎿庤嫢琚皾璇曞悗澶辫触锛岃褰曞け璐ヨ鎯咃紙鐢ㄤ簬 Note锛?
      let preferredFailure = null;
      // 鎬昏秴鏃堕绠楋細涓茶鍥為€€鏃堕檺鍒舵暣鏉″紩鎿庨摼鐨勬€绘椂闀匡紝闃叉鍚勫紩鎿庤秴鏃剁疮鍔犺揪鍒嗛挓绾?
      const BUDGET_MS = 30000;
      const deadline = Date.now() + BUDGET_MS;
      for (const engine of chain) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new Error(`search timed out after ${BUDGET_MS / 1000}s`);
        }
        // 缁勫悎澶栭儴鍙栨秷 signal + 鍓╀綑棰勭畻瓒呮椂锛氬畼鏂?web_search 鍙栨秷銆佸紩鎿庤秴鏃躲€佹€婚绠楅兘鑳借Е鍙?
        const effSignal = AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(remaining)]);
        try {
          let result;
          if (engine === "ddg") {
            result = await searchDdgHtml(request.query, request.maxResults, { ...cfg, timeRange }, effSignal);
          } else if (engine === "ddg-lite") {
            result = await searchDdgLite(request.query, request.maxResults, { ...cfg, timeRange }, effSignal);
          } else if (engine === "bing") {
            result = await searchBing(request.query, request.maxResults, cfg, effSignal);
          } else if (engine === "searxng") {
            result = await searchSearxng(request.query, request.maxResults, { ...cfg, timeRange }, effSignal);
          } else if (engine === "anysearch") {
            result = await searchAnysearch(request.query, request.maxResults, effSignal);
          } else if (engine === "exa") {
            // exa锛氭湁 key 璧?REST锛屾棤 key 璧?keyless MCP锛堝厤璐癸級
            const key = await resolveApiKey("EXA_API_KEY", "exaApiKey");
            if (key) {
              result = await searchExa(request.query, request.maxResults, key, timeRange, effSignal);
            } else {
              result = await searchExaMCP(request.query, request.maxResults, effSignal);
            }
          } else if (engine === "tavily") {
            // tavily锛氭湁 key 璧拌处鍙锋。锛屾棤 key 璧?keyless锛堝厤璐瑰尶鍚嶉搴︼級
            const key = await resolveApiKey("TAVILY_API_KEY", "tavilyApiKey");
            result = await searchTavily(request.query, request.maxResults, key, timeRange, effSignal);
          } else if (engine === "keenable") {
            // keenable锛氭湁 key 璧?REST锛屾棤 key 璧?keyless MCP锛堝厤璐癸級
            const key = await resolveApiKey("KEENABLE_API_KEY", "keenableApiKey");
            result = await searchKeenable(request.query, request.maxResults, key, timeRange, effSignal);
          } else if (engine === "perplexity") {
            const key = await resolveApiKey("PERPLEXITY_API_KEY", "perplexityApiKey");
            if (!key) {
              lastError = new Error("Perplexity requires PERPLEXITY_API_KEY");
              if (engine === preferred) preferredFailure = "PERPLEXITY_API_KEY is not configured";
              logger.warn(`free-search: engine "${engine}" skipped (no key), trying next engine`);
              continue; // 鏃?key 璺宠繃
            }
            result = await searchPerplexity(request.query, request.maxResults, key, effSignal);
          } else if (engine === "deepseek-official") {
            const key = await resolveApiKey("DEEPSEEK_API_KEY", "deepseekApiKey");
            if (!key) {
              lastError = new Error("DeepSeek requires DEEPSEEK_API_KEY");
              if (engine === preferred) preferredFailure = "DEEPSEEK_API_KEY is not configured";
              logger.warn(`free-search: engine "${engine}" skipped (no key), trying next engine`);
              continue; // 鏃?key 璺宠繃
            }
            result = await searchDeepSeekOfficial(request.query, request.maxResults, key, effSignal);
          } else {
            continue;
          }

          if (result.sources.length > 0) {
            usedEngine = engine;
            // 缁熶竴娓呮礂 snippet锛氬幓鐧诲綍/浠樿垂澧?璁㈤槄鍣煶锛屾姌鍙犵┖鐧斤紙鏈夊€肩殑鎵嶅鐞嗭紝淇濇寔 lossless JSON锛?
            result.sources = result.sources.map((s) =>
              s.snippet ? { ...s, snippet: cleanSnippet(s.snippet) } : s
            );
            // 鐢ㄤ簡闈為閫夊紩鎿庢椂锛屽湪缁撴灉閲岄檮涓婂噯纭彁绀猴紙鍖哄垎"涓嶆敮鎸佹椂闂磋繃婊よ璺宠繃"涓?鐪熷疄澶辫触"锛?
            if (engine !== preferred) {
              if (preferredSkippedReason === "time-filter") {
                result.content = `Note: ${preferred} does not support time filtering (timeRange=${timeRangeLabel}), using ${engine}.`;
              } else if (preferredFailure) {
                result.content = `Note: ${preferred} unavailable or failed (${preferredFailure}), using ${engine}.`;
              } else {
                result.content = `Note: ${preferred} unavailable or failed, using ${engine}.`;
              }
            }
            // 鍐欏叆缂撳瓨锛堝彧缂撳瓨鎴愬姛缁撴灉锛屽け璐ヨ蛋 throw 澶╃劧涓嶇紦瀛橈級
            const cached = { ...result, provider: engine, engine: engine };
            if (cacheKey !== null) {
              // fallback 鏉＄洰锛堝疄闄呭紩鎿庘墵棣栭€夛級鐢ㄩ厤缃?TTL 鐨?1/5锛岄閫夋垚鍔熶繚鎸佸畬鏁?TTL
              const entryTtlMs = engine !== preferred ? Math.max(cacheTtlMs / 5, 1000) : cacheTtlMs;
              searchCache.set(cacheKey, {
                value: cached,
                expiresAt: Date.now() + entryTtlMs,
              });
              if (searchCache.size > CACHE_MAX_ENTRIES) {
                const oldest = searchCache.keys().next().value;
                if (oldest !== undefined) searchCache.delete(oldest);
              }
            }
            return { ...cached, _cache: "miss" };
          }
          lastError = new Error(`engine "${engine}" returned 0 results`);
          if (engine === preferred) preferredFailure = "returned 0 results";
          logger.warn(`free-search: ${engine} returned 0 results, trying next engine`);
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          if (engine === preferred) preferredFailure = message;
          logger.warn(`free-search: engine "${engine}" failed (${message}), trying next engine`);
        }
      }
      throw lastError ?? new Error("all search engines failed");
    },
  };

  ctx.inject(["settings"], (sctx) => {
    sctx.settings.installSection(ctx, FREE_SEARCH_NS, Config, config ?? {}, {
      setSource: (source) => {
        current = source;
      },
      onChange: () => {
        // settings 鍙樻洿鏃跺埛鏂扮郴缁熸彁绀鸿瘝锛堟樉绀烘渶鏂板紩鎿庯級
        if (typeof refreshPrompt === "function") refreshPrompt();
      },
    });
  });

  ctx.inject(["webServer", "settings"], (sctx) => {
    sctx.effect(() => {
      const disposers = makeBridgeRoutes(
        sctx.settings,
        (request) => provider.search(request, undefined),
        (engine, query, timeRange) => runEngineTest(engine, query, timeRange),
        getCredentials
      ).map((route) => sctx.webServer.register(route));
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, "free-search: settings bridge");
  });

  ctx.web.registerSearchProvider(provider);

  // 杩愯鏃跺厹搴曪細DSH 0.1.1+ 涓?profile patch 鐨?config 浼氭暣浣撹鐩?bundle patch 鐨?config锛?
  // 鐢ㄦ埛鐨?`- id: web` patch锛堝鍙 fetchProvider锛変細闈欓粯鎶规帀 searchProvider锛屽鑷村洖閫€ DeepSeek 瀹樻柟鎼滅储銆?
  // 杩欓噷鍦?provider 娉ㄥ唽鍚庢鏌ワ細鏈寚鍚戜换浣?provider锛坲ndefined锛夋椂鑷姩鎺ョ涓烘湰鎻掍欢锛?
  // 鐢ㄦ埛鏄惧紡閰嶇疆浜嗗叾浠?provider 鍒欎笉鍔ㄣ€?
  if (!ctx.web.searchProviderId) {
    ctx.web.searchProviderId = provider.id;
    logger.info(`free-search: web.searchProvider was unset (patch override or missing config), taking over as "${provider.id}"`);
  }

  // 娴嬭瘯宸ュ叿锛氳 agent 閫愪釜娴嬭瘯鎵€鏈夋悳绱㈠紩鎿庯紝鎶ュ憡鍙敤鎬?
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
      // 浠樿垂寮曟搸鏃?key锛氱洿鎺ラ€忎紶澶辫触缁撴灉
      if (result.ok === false) return result;
      // 鍏嶈垂寮曟搸鍋跺彂鍙嶇埇/绌虹粨鏋滄椂閲嶈瘯涓€娆?
      if (result.sources && result.sources.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return await attempt();
      }
      return {
        ok: true,
        sources: (result.sources ?? []).map((s) =>
          s.snippet ? { ...s, snippet: cleanSnippet(s.snippet) } : s
        ),
        truncated: result.truncated ?? false,
      };
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
            // 鎶?render 杈撳嚭鍖呰鎴愬悎娉曠殑 text block锛坈ontent 蹇呴』鏄?block 鏁扮粍锛?
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

  // 骞冲彴鎼滅储宸ュ叿锛欸itHub / V2EX / Bilibili / Reddit锛堝叕寮€ API锛岄浂渚濊禆锛?
  ctx.inject(["tools"], (sctx) => {
    sctx.effect(() => {
      const dispose = sctx.tools.register(
        defineTool({
          name: "platform_search",
          description:
            "Search a specific platform (GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / Wikipedia / npm) for a query. Returns source URLs with titles and snippets. Use this when the user asks about repos, code, forum threads, videos, discussions, Q&A, encyclopedia entries, or packages.",
          parameters: {
            platform: {
              type: "string",
              description: "Platform to search: github, v2ex, bilibili, reddit, hn, stackoverflow, wikipedia, npm",
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
            // 骞冲彴寮€鍏筹細settings 閲岀鐢ㄦ煇骞冲彴鏃讹紝宸ュ叿鏄庣‘鍛婄煡
            const enabled = current().platforms ?? ["github", "v2ex", "bilibili", "reddit", "hn", "stackoverflow", "wikipedia", "npm"];
            if (!enabled.includes(platform)) {
              throw new Error(
                `platform "${platform}" is disabled in Free Search settings - enable it in Settings > Plugins > Free Search to use it`
              );
            }
            const limit = Math.min(args.maxResults ?? 5, 10);
            const result = await searchPlatform(platform, args.query, limit, undefined, current().lang);
            // lossless JSON 涓嶅厑璁?undefined 瀛楁锛氬墧闄ょ己澶卞瓧娈?
            const sources = (result.sources ?? []).map((s) => {
              const source = {};
              if (s.url !== undefined && s.url !== null && s.url !== "") source.url = s.url;
              if (s.title !== undefined && s.title !== null && s.title !== "") source.title = String(s.title);
              if (s.snippet !== undefined && s.snippet !== null && s.snippet !== "") source.snippet = String(s.snippet);
              return source;
            });
            return { platform, sources };
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

  // 楂樼骇鎼滅储宸ュ叿锛氭敮鎸佹椂闂磋繃婊わ紙time_range锛夊拰鎸囧畾寮曟搸锛坋ngine锛夈€?
  // 璧颁笌 web_search 鐩稿悓鐨勭粺涓€鍥為€€閾撅紝浣嗗厑璁?agent 鏄惧紡璇锋眰"鏈€杩?N 澶?鐨勭粨鏋溿€?
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
            if (!args.query || !String(args.query).trim()) throw new Error("query is required");
            const request = {
              query: args.query,
              maxResults: Math.min(args.maxResults ?? 5, 10),
            };
            if (parseTimeRange(args.timeRange) !== undefined) request.timeRange = args.timeRange;
            // engine 鎸囧畾鏃讹細浠呭綋璇ュ紩鎿庡彲鐢ㄦ墠浼樺厛锛堜粛璧板洖閫€閾撅紝澶辫触鑷姩鎹㈠紩鎿庯級
            if (args.engine && ALL_ENGINES.includes(args.engine)) request.engine = args.engine;
            const result = await provider.search(request);
            // lossless JSON 涓嶅厑璁?undefined 瀛楁锛氭寜瀛樺湪鐨勫€兼瀯閫犲璞★紝缂哄瓧娈电洿鎺ョ渷鐣?
            return {
              provider: result.provider ?? result._provider ?? "bing",
              content: typeof result.content === "string" ? result.content : "",
              sources: (result.sources ?? []).map((s) => {
                const source = {};
                if (s.url !== undefined && s.url !== null && s.url !== "") source.url = s.url;
                if (s.title !== undefined && s.title !== null && s.title !== "") source.title = String(s.title);
                if (s.snippet !== undefined && s.snippet !== null && s.snippet !== "") source.snippet = String(s.snippet);
                if (s.publishedAt !== undefined && s.publishedAt !== null && s.publishedAt !== "") {
                  source.publishedAt = String(s.publishedAt);
                }
                return source;
              }),
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

  // 璁?agent 鐭ラ亾鍙敤鎼滅储寮曟搸锛堝姩鎬佺敓鎴愶紝闅?key/璁剧疆鍙樺寲锛?
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
          "Safe search filter (Settings > Plugins > Free Search): " + (current().safeSearch ?? "off") + " (off|moderate|strict). Engine default off; applies to bing/ddg/ddg-lite.",
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
          "IMPORTANT: If the configured engine fails (missing key, invalid key, 401, rate limit, or network error), web_search automatically tries other engines in this order: (1) the configured engine first, (2) then other engines with API keys configured (exa/tavily/keenable work keyless too, so they are tried even without a key), (3) then the remaining free engines (Bing, AnySearch, DuckDuckGo, SearXNG). This applies to ALL engines - paid or free. The results include a note showing which engine was actually used and why the preferred one was skipped. Understand the two note forms: (a) 'Note: X does not support time filtering (timeRange=...), using Y.' means X cannot filter by time so it was skipped BEFORE any attempt (X did NOT fail); (b) 'Note: X unavailable or failed (reason), using Y.' means X was actually tried but failed (missing key / invalid key / 401 / rate limit / network / 0 results). Never tell the user search is unavailable - it always falls back.",
          "",
          "Use the free_search_test tool to test which engines actually work right now.",
          "",
          "When the user wants results from a specific time window (e.g. 'last week', 'this month', 'last 3 days'), use the advanced_search tool with timeRange. Fixed tiers: day|week|month|year. Custom: 12h, 3d, 2mo, 1y, or an absolute date like 2026-07-01.",
          "",
          "For platform-specific searches (GitHub repos, V2EX threads, Bilibili videos, Reddit posts, Hacker News discussions, Stack Overflow questions, Wikipedia articles, npm packages), use the platform_search tool with platform: github|v2ex|bilibili|reddit|hn|stackoverflow|wikipedia|npm.",
          "",
          "The user can switch the search engine themselves by typing /free-search-engine in the chat 鈥?it opens a picker to choose an engine, just like the settings page. This changes the preferred engine; search still falls back to other engines automatically if it fails. You should not switch engines on your own; let the user decide.",
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
  searchHackerNews,
  searchKeenable,
  searchKeenableMCP,
  searchKeenableREST,
  searchNpm,
  searchPerplexity,
  searchPlatform,
  searchReddit,
  searchSearxng,
  searchStackOverflow,
  searchTavily,
  searchV2ex,
  searchWikipedia,
};
