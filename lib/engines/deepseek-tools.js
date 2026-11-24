// DeepSeek native /v1/tools/search engine.
import { TAVILY_URL, FIRECRAWL_URL, isFirecrawlKeylessRefusal, markFirecrawlKeylessBlocked, PARALLEL_URL, PARALLEL_MCP_URL, PARALLEL_USER_AGENT, KEENABLE_URL, KEENABLE_MCP_URL, SERPBASE_URL, SERPLY_URL, OUTCRAWL_URL, YOUCOM_URL, YOUCOM_FREE_URL, YOUCOM_KEYS_LINK, isoDaysAgo, parseTimeRange, approximateTimeRange, uniqueSources } from "./shared.js";
import { parseMcpResponseText } from "../mcp_adapter.js";
import { proxyFetch } from "../proxy_fetch.js";

const DEEPSEEK_TOOLS_SEARCH_URL = "https://api.deepseek.com/v1/tools/search";

export function deepseekToolsEndpoint(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return DEEPSEEK_TOOLS_SEARCH_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DeepSeek tools URL is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("DeepSeek tools URL must be http(s)");
  }
  if (url.pathname === "" || url.pathname === "/") {
    url.pathname = "/v1/tools/search";
  } else if (url.pathname === "/v1" || url.pathname === "/v1/") {
    url.pathname = "/v1/tools/search";
  } else if (url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString().replace(/\/$/, "");
}

// 原生搜索接口没有独立的时间字段，时间过滤写在 query 语法里（after:/before:）。
// 支持 `after:2025`、`after:2025-01-01`；这里把统一的 timeRange 映射成 after:。

function deepseekToolsQuery(query, timeRange) {
  const parsed = parseTimeRange(timeRange);
  if (!parsed) return query;
  if (parsed.after) return `${query} after:${parsed.after}`;
  if (parsed.days) {
    const since = new Date(Date.now() - parsed.days * 86400000).toISOString().slice(0, 10);
    return `${query} after:${since}`;
  }
  return query;
}

export function applySnippetLimits(sources, maxChars = 600, budgetChars = 0) {
  const maxRaw = Number(maxChars);
  const budgetRaw = Number(budgetChars);
  const cap = Number.isFinite(maxRaw) && maxRaw >= 0 ? Math.floor(maxRaw) : 600;
  const budget = Number.isFinite(budgetRaw) && budgetRaw > 0 ? Math.floor(budgetRaw) : 0;
  const capped = sources.map((source) => {
    if (typeof source.snippet !== "string") return source;
    const limit = cap === 0 ? source.snippet.length : Math.min(source.snippet.length, cap);
    return limit < source.snippet.length ? { ...source, snippet: source.snippet.slice(0, limit) } : source;
  });
  if (budget === 0) return capped;
  const lengths = capped.map((source) => source.snippet?.length ?? 0);
  const shares = lengths.map((length) => Math.min(length, Math.floor(budget / Math.max(1, lengths.length))));
  let remaining = budget - shares.reduce((sum, share) => sum + share, 0);
  while (remaining > 0) {
    let progressed = false;
    for (let index = 0; index < lengths.length && remaining > 0; index += 1) {
      if (shares[index] >= lengths[index]) continue;
      shares[index] += 1;
      remaining -= 1;
      progressed = true;
    }
    if (!progressed) break;
  }
  return capped.map((source, index) =>
    typeof source.snippet === "string" && shares[index] < source.snippet.length
      ? { ...source, snippet: source.snippet.slice(0, shares[index]) }
      : source
  );
}

export async function searchDeepSeekTools(query, maxResults, apiKey, timeRange, signal, baseUrl = "", snippetMaxChars = 600, snippetBudgetChars = 0, minScore = 0) {
  if (!apiKey) throw new Error("DeepSeek search requires DEEPSEEK_API_KEY");
  const limit = Math.min(Math.max(maxResults ?? 5, 1), 50);
  // 超额取数：按请求计费，且缺 url 的行会被丢弃，多取一些补位成本为零
  const count = Math.min(50, Math.max(limit, Math.ceil(limit * 1.5)));

  const response = await proxyFetch(deepseekToolsEndpoint(baseUrl), {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify({ query: deepseekToolsQuery(query, timeRange), count }),
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(20000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("DeepSeek API key is invalid (HTTP 401) - update it in Settings > Plugins > Free Search");
    }
    // 402 余额不足是终态：不要当成可重试的暂时故障
    if (response.status === 402) {
      throw new Error("DeepSeek account balance is insufficient (HTTP 402) - top up at https://platform.deepseek.com");
    }
    throw new Error(`DeepSeek API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data?.results) ? data.results : [];
  // #165：官方 SearchResult 的 rerank_score（0~3，1.5+ 为高质量）与 authority
  // （0~4，-1 未知，3+ 为高权威）都由服务端算好了。丢弃它们等于让模型只能凭
  // 标题与摘要猜质量，所以原样透传，并按需按分数过滤。
  const floor = Number(minScore);
  const min = Number.isFinite(floor) && floor > 0 ? floor : 0;
  const sources = rows
    .filter((r) => r && typeof r.url === "string" && r.url.length > 0)
    .map((r) => {
      // summary（600~800 字，面向模型）与 snippet（100~200 字，面向渲染）同时存在时拼接，
      // 不再二选一。
      const summary = typeof r.summary === "string" ? r.summary.trim() : "";
      const snippet = typeof r.snippet === "string" ? r.snippet.trim() : "";
      const text = summary && snippet && summary !== snippet ? `${summary}\n${snippet}` : summary || snippet;
      // 官方字段名是 site_name；部分自建/兼容网关回的是 site，两个都认。
      const siteRaw = typeof r.site_name === "string" ? r.site_name : typeof r.site === "string" ? r.site : "";
      const siteName = siteRaw.trim();
      return {
        url: r.url,
        ...(r.title ? { title: String(r.title) } : {}),
        ...(text ? { snippet: text } : {}),
        ...(siteName ? { site: siteName } : {}),
        // date 是 UTC RFC3339，只保留日期部分与其它引擎的 publishedAt 对齐
        ...(r.date ? { publishedAt: String(r.date).slice(0, 10) } : {}),
        ...(typeof r.rerank_score === "number" && Number.isFinite(r.rerank_score) ? { score: r.rerank_score } : {}),
        ...(typeof r.authority === "number" && Number.isFinite(r.authority) ? { authority: r.authority } : {}),
      };
    });

  // 先去重、再按分数裁、最后按条数裁：顺序反了会出现「同一页面被低分副本
  // 代表、而高分副本已被 maxResults 切掉」的浪费。
  const deduped = uniqueSources(sources, sources.length);
  const filtered = min > 0 ? deduped.filter((s) => (s.score ?? 0) >= min) : deduped;
  return {
    sources: applySnippetLimits(filtered, snippetMaxChars, snippetBudgetChars).slice(0, maxResults ?? 10),
    // 过滤后一条不剩时如实告知，而不是让上层以为引擎"空手而归"。
    // 走 content 通道：provider 与工具都只把 content 当作附注透传给模型。
    // 计数是候选数（超额取数后的条数），不是本次请求的 maxResults。
    ...(min > 0 && deduped.length > 0 && filtered.length === 0
      ? { content: `Note: none of the ${deduped.length} candidates reached rerank_score ${min} (deepseekToolsMinScore).` }
      : {}),
    truncated: false,
  };
}

// SerpBase: 必须配置 SERPBASE_API_KEY（无 key 跳过，同 perplexity）
// Google SERP API：POST + X-API-Key 头，返回 organic[]（title/link/snippet/published_at）。
// 注意：SerpBase 始终返回 HTTP 200，业务状态放在 JSON 的 status 字段（0=成功，1001=key 无效/缺失，1000=请求非法）。
