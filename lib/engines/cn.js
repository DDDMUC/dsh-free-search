// Chinese engines: Baidu / Kimi / Aliyun / Doubao / TinyFish / Jina.
import { TINYFISH_URL, JINA_URL, DOUBAO_SEARCH_URL, snippetCap, stripTags, uniqueSources } from "./shared.js";
import { TIME_ENGINES } from "../engine_meta.js";

export async function searchTinyfish(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("TinyFish search requires TINYFISH_API_KEY");
  const params = new URLSearchParams({ query });
  if (timeRange) {
    if (timeRange.after) {
      params.set("after_date", timeRange.after);
    } else if (timeRange.days !== undefined) {
      params.set("after_date", new Date(Date.now() - timeRange.days * 86400000).toISOString().slice(0, 10));
    }
  }
  const response = await fetch(`${TINYFISH_URL}?${params}`, {
    method: "GET",
    redirect: "error",
    headers: {
      "X-API-Key": apiKey,
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`TinyFish API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    if (response.status === 429) {
      throw new Error("TinyFish rate limit exceeded (HTTP 429) - free tier is 30 req/min, 500 req/hour");
    }
    throw new Error(`TinyFish API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  // 响应：{ query, results: [ { position, site_name, title, snippet, url } ], total_results, page }
  const sources = (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.snippet ? { snippet: String(r.snippet).slice(0, 300) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// Jina Search（s.jina.ai）：GET + Bearer；需 JINA_API_KEY。
export async function searchJina(query, maxResults, apiKey, signal) {
  if (!apiKey) throw new Error("Jina search requires JINA_API_KEY");
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`${JINA_URL}?${params}`, {
    method: "GET",
    redirect: "error",
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      "user-agent": "deepseek-harness/free-search",
    },
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(20000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Jina API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    if (response.status === 429) {
      throw new Error("Jina rate limit exceeded (HTTP 429) - check your plan at jina.ai");
    }
    throw new Error(`Jina API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  // 响应：{ code, status, data: [ { title, url, description, content } ] }
  const sources = (data.data ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.description ? { snippet: String(r.description).slice(0, 300) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// 百度千帆 AI 搜索（v2/ai_search/web_search）
// key = 环境变量 BAIDU_API_KEY
export async function searchBaidu(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Baidu search requires BAIDU_API_KEY");
  const count = Math.min(Math.max(maxResults ?? 10, 1), 50);
  const searchFilter = {};
  if (timeRange) {
    const now = new Date();
    const end = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
    let start;
    if (timeRange.after) {
      start = timeRange.after;
    } else if (timeRange.days !== undefined) {
      start = new Date(now.getTime() - timeRange.days * 86400000).toISOString().slice(0, 10);
    }
    if (start) {
      searchFilter.range = { page_time: { gte: start, lt: end } };
    }
  }

  const body = {
    messages: [{ content: query, role: "user" }],
    search_source: "baidu_search_v2",
    resource_type_filter: [{ type: "web", top_k: count }],
    search_filter: searchFilter,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetch("https://qianfan.baidubce.com/v2/ai_search/web_search", {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "X-Appbuilder-From": "openclaw",
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Baidu search request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Baidu API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    throw new Error(`Baidu API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }

  const results = await response.json();
  if (results.code) {
    throw new Error(`Baidu API error: ${results.message ?? JSON.stringify(results)}`);
  }

  const sources = (results.references ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      ...(r.title ? { title: String(r.title) } : {}),
      ...(r.content ? { snippet: String(r.content).slice(0, 300) } : {}),
      ...(r.date ? { publishedAt: String(r.date) } : {}),
    }));
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// Kimi (Moonshot) 开放平台联网搜索 basic (/v1/tools/search)
// key = MOONSHOT_API_KEY
export async function searchKimi(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Kimi search requires MOONSHOT_API_KEY");
  const limit = Math.min(Math.max(maxResults ?? 5, 1), 20);
  const body = {
    text_query: query,
    limit,
    timeout_seconds: 30,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetch("https://api.moonshot.cn/v1/tools/search", {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Kimi search request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Kimi API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    throw new Error(`Kimi API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const sources = (data.search_results ?? [])
    .filter((r) => r.url)
    .map((r) => {
      let snippet = "";
      if (Array.isArray(r.chunks) && r.chunks.length > 0) {
        // chunks 是 [{ text }]（Basic 档位返回的正文片段），不是字符串数组
        snippet = r.chunks
          .map((c) => (typeof c === "string" ? c : c && typeof c.text === "string" ? c.text : ""))
          .filter(Boolean)
          .join(" ");
      } else if (r.snippet) {
        snippet = String(r.snippet);
      }
      return {
        url: r.url,
        ...(r.title ? { title: String(r.title) } : {}),
        ...(snippet ? { snippet: snippet.slice(0, 300) } : {}),
        ...(r.publish_date ? { publishedAt: String(r.publish_date) } : {}),
      };
    });
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// 阿里云百炼 EnhancedSearch MCP (search_pro)
// key = DASHSCOPE_API_KEY
export async function searchAliyun(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Aliyun search requires DASHSCOPE_API_KEY");
  const trimmed = String(query).trim();
  const q = trimmed.length < 2 ? `${trimmed} ` : trimmed.slice(0, 500);

  const rpcBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "search_pro",
      arguments: { query: q },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetch("https://dashscope.aliyuncs.com/api/v1/mcps/EnhancedSearch/mcp", {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "user-agent": "deepseek-harness/free-search",
      },
      body: JSON.stringify(rpcBody),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Aliyun search request failed: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Aliyun API key is invalid (HTTP ${response.status}) - update it in Settings > Plugins > Free Search`);
    }
    throw new Error(`Aliyun API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }

  const rawText = await response.text();
  let envelope;
  try {
    envelope = JSON.parse(rawText);
  } catch {
    // 处理可能的 SSE 帧 (data: { ... })
    const dataLine = rawText.split("\n").find((l) => l.startsWith("data:"));
    if (dataLine) {
      try {
        envelope = JSON.parse(dataLine.slice(5).trim());
      } catch (e) {
        throw new Error(`Aliyun MCP response SSE parse failed: ${rawText.slice(0, 200)}`);
      }
    } else {
      throw new Error(`Aliyun MCP response is not valid JSON: ${rawText.slice(0, 200)}`);
    }
  }

  if (envelope.error) {
    throw new Error(`Aliyun MCP error ${envelope.error.code}: ${envelope.error.message}`);
  }

  const callResult = envelope.result;
  if (!callResult || typeof callResult !== "object") {
    throw new Error(`Aliyun MCP result missing: ${JSON.stringify(envelope).slice(0, 200)}`);
  }
  if (callResult.isError) {
    throw new Error(`Aliyun tool error: ${JSON.stringify(callResult).slice(0, 200)}`);
  }

  const contents = callResult.content;
  if (!Array.isArray(contents) || contents.length === 0) {
    return { sources: [], truncated: false };
  }
  const textItem = contents.find((c) => c && c.type === "text" && typeof c.text === "string");
  if (!textItem) {
    return { sources: [], truncated: false };
  }

  let inner;
  try {
    inner = JSON.parse(textItem.text);
  } catch (err) {
    throw new Error(`Aliyun inner content JSON parse error: ${textItem.text.slice(0, 200)}`);
  }

  const pages = inner.pages;
  if (!Array.isArray(pages)) {
    return { sources: [], truncated: false };
  }

  const sources = pages
    .filter((p) => p && p.url)
    .map((p) => ({
      url: p.url,
      ...(p.title ? { title: String(p.title) } : {}),
      ...(p.snippet ? { snippet: String(p.snippet).slice(0, 300) } : {}),
      ...(p.published_at ? { publishedAt: String(p.published_at) } : {}),
    }));

  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}


// ── 知乎开放平台 MCP（developer.zhihu.com/api/mcp/v1）─────────────────────────
// 两个引擎共用一套 MCP 适配器（lib/mcp_adapter.js，方案 v4.3 §2.7）：
//   zhihu_global → tools/call global_search（全网，filter 支持 publish_time>=unix秒 → 入 TIME_ENGINES）
//   zhihu_site   → tools/call zhihu_search（站内，未验证时间过滤 → 不入 TIME_ENGINES）
// 服务端为无状态 streamable-http：实测直连 tools/call 即可（initialize 非必需，也无 session 头），
// 响应可能是纯 JSON 或 SSE 帧——两种格式由适配器统一解析。
// key = ZHIHU_API_KEY（凭据中心 → 本条目 config zhihuApiKey → 环境变量，三级解析；无 key 时引擎跳过不阻断回退链）

function doubaoTimeRange(timeRange) {
  if (!timeRange) return undefined;
  if (typeof timeRange.after === "string") {
    const end = new Date().toISOString().slice(0, 10);
    return `${timeRange.after}..${end}`;
  }
  const days = Number(timeRange.days);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  if (days <= 1) return "OneDay";
  if (days <= 7) return "OneWeek";
  if (days <= 31) return "OneMonth";
  return "OneYear";
}

const DOUBAO_ERROR_HINTS = {
  10400: "invalid request parameters (check Query/Count/TimeRange)",
  10402: "invalid SearchType (only web|image)",
  10403: "account or permission problem - make sure the key is from the Web Search console",
  10406: "free quota exhausted (500 requests/month on the free tier) - check your plan",
  10407: "no available free-tier policy - check the account status",
  10500: "Web Search service internal error - retry later",
  700429: "free-tier rate limit hit - slow down and retry",
  100013: "sub-account is not granted TorchlightApiFullAccess",
  700901: "invalid api key",
};

export async function searchDoubao(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Doubao search requires DOUBAO_SEARCH_API_KEY");
  const count = Math.min(Math.max(maxResults ?? 10, 1), 50);
  const body = {
    Query: String(query).slice(0, 100),
    SearchType: "web",
    Count: count,
    NeedSummary: true,
    Filter: { NeedUrl: true },
  };
  const range = doubaoTimeRange(timeRange);
  if (range !== undefined) body.TimeRange = range;

  const response = await fetch(DOUBAO_SEARCH_URL, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "X-Traffic-Tag": "dsh-free-search",
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(20000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Doubao search auth failed (HTTP ${response.status}) - check DOUBAO_SEARCH_API_KEY (Web Search console)`
      );
    }
    throw new Error(`Doubao search API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  // HTTP 200 也可能携带错误信封
  const err = data?.ResponseMetadata?.Error;
  if (err && (err.Code || err.CodeN || err.Message)) {
    const code = err.CodeN ?? err.Code;
    const hint = DOUBAO_ERROR_HINTS[Number(code)] ?? DOUBAO_ERROR_HINTS[String(code)];
    throw new Error(
      `Doubao search API error (${code ?? "unknown"}): ${err.Message ?? "request failed"}${hint ? ` - ${hint}` : ""}`
    );
  }

  const hits = data?.Result?.WebResults ?? [];
  const sources = hits
    .filter((item) => item && item.Url)
    .map((item) => {
      const raw = item.Summary || item.Content || item.Snippet || "";
      const snippet = stripTags(String(raw)).replace(/\s+/g, " ").trim();
      return {
        url: String(item.Url),
        ...(item.Title ? { title: stripTags(String(item.Title)).trim() } : {}),
        ...(snippet ? { snippet: snippet.slice(0, snippetCap("doubao")) } : {}),
        ...(item.PublishTime ? { publishedAt: String(item.PublishTime) } : {}),
      };
    });
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}
//#endregion

//#region bridge
const MAX_JSON_BODY_BYTES = 64 * 1024;

// #84：桥接接口的 Host 围栏。
// DSH 宿主对 /api 已经做了同样的 Browser-trust 围栏并完成鉴权：放行 loopback、
// 监听绑定的 IP 字面量，以及 --trusted-host / --public-url 声明的 authority。
// 插件此前只认 loopback，于是 VPS / 反向代理 / 自定义域名下配置页整体 403、表单全灰。
// 这里沿用宿主的信任集合，而不是把写接口无差别放开。
const bridgeTrust = { hosts: [], publicHost: "" };
