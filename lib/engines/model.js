// Model built-in searches: OpenAI Responses / Gemini Interactions / Claude web_search (explicit-only, billed per call).
import { stripTags, uniqueSources } from "./shared.js";
import { stripTrackingParams } from "../url_norm.js";

function openaiResponsesUrl(baseUrl) {
  const base = (typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, "");
  return base.endsWith("/responses") ? base : base + "/responses";
}

// OpenAI 给引用链接追加 utm_source=openai、知乎开放平台挂 utm_medium/openapi_platform：
// 统一走 lib/url_norm.js 的 stripTrackingParams（#69 §4 的唯一权威实现），
// 不再各写一份——两处旧实现只在自己引擎适配器里生效，管不到 multi 合并阶段。
function stripOpenaiTracking(url) {
  return stripTrackingParams(url);
}

export async function searchOpenai(query, maxResults, apiKey, options, signal) {
  if (!apiKey) throw new Error("OpenAI search requires OPENAI_API_KEY");
  const model = (typeof options?.openaiModel === "string" && options.openaiModel.trim()) || OPENAI_DEFAULT_MODEL;
  const response = await fetch(openaiResponsesUrl(options?.openaiBaseUrl), {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + apiKey,
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify({ model, input: String(query), tools: [{ type: "web_search" }] }),
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(45000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error("OpenAI API key is invalid (HTTP " + response.status + ") - update it in Settings > Plugins > Free Search");
    }
    if (response.status === 429) {
      throw new Error("OpenAI rate limit or quota exceeded (HTTP 429) - check your OpenAI usage/limits");
    }
    throw new Error("OpenAI search API error (HTTP " + response.status + "): " + detail.slice(0, 200));
  }
  const data = await response.json();
  if (data?.error) {
    throw new Error("OpenAI response failed: " + (data.error.message ?? JSON.stringify(data.error).slice(0, 200)));
  }
  // citations 以 url_citation annotation 的形式挂在 message 的 output_text 上
  const sources = [];
  for (const item of data.output ?? []) {
    if (!item || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      const text = typeof part?.text === "string" ? part.text : "";
      for (const annotation of part?.annotations ?? []) {
        if (annotation?.type !== "url_citation" || typeof annotation.url !== "string" || !annotation.url) continue;
        sources.push({
          url: stripOpenaiTracking(annotation.url),
          ...(annotation.title ? { title: String(annotation.title) } : {}),
          ...(text.trim() ? { snippet: stripTags(text).slice(0, 300) } : {}),
        });
      }
    }
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function geminiInteractionsUrl(baseUrl) {
  const base = (typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : GEMINI_DEFAULT_BASE_URL).replace(/\/+$/, "");
  return base.endsWith("/interactions") ? base : base + "/interactions";
}

export async function searchGemini(query, maxResults, apiKey, options, signal) {
  if (!apiKey) throw new Error("Gemini search requires GEMINI_API_KEY");
  const model = (typeof options?.geminiModel === "string" && options.geminiModel.trim()) || GEMINI_DEFAULT_MODEL;
  const response = await fetch(geminiInteractionsUrl(options?.geminiBaseUrl), {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify({
      model,
      input: String(query),
      tools: [{ type: "google_search" }],
    }),
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(45000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error("Gemini API key or request rejected (HTTP " + response.status + ") - check GEMINI_API_KEY and the model name. " + detail.slice(0, 160));
    }
    if (response.status === 429) {
      throw new Error("Gemini rate limit or quota exceeded (HTTP 429) - check your Google AI Studio quota");
    }
    throw new Error("Gemini search API error (HTTP " + response.status + "): " + detail.slice(0, 200));
  }
  const data = await response.json();
  if (data?.error) {
    throw new Error("Gemini response failed: " + (data.error.message ?? JSON.stringify(data.error).slice(0, 200)));
  }
  // Interactions API：结果在 steps[] 里；model_output 步骤的 text 块带 url_citation 注解
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  let answer = typeof data?.output_text === "string" ? data.output_text : "";
  const sources = [];
  for (const step of steps) {
    if (!step || step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const block of step.content) {
      if (!block || block.type !== "text") continue;
      const text = typeof block.text === "string" ? block.text : "";
      if (!answer && text.trim()) answer = text;
      for (const annotation of block.annotations ?? []) {
        if (annotation?.type !== "url_citation" || typeof annotation.url !== "string" || !annotation.url) continue;
        sources.push({
          url: annotation.url,
          ...(annotation.title ? { title: String(annotation.title) } : {}),
          ...(text.trim() ? { snippet: stripTags(text).slice(0, 300) } : {}),
        });
      }
    }
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

const CLAUDE_DEFAULT_MODEL = "claude-sonnet-5-5";
const CLAUDE_DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const CLAUDE_DEFAULT_VERSION = "2023-06-01";

function claudeMessagesUrl(baseUrl) {
  const base = (typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : CLAUDE_DEFAULT_BASE_URL).replace(/\/+$/, "");
  return base.endsWith("/messages") ? base : base + "/messages";
}

export async function searchClaude(query, maxResults, apiKey, options, signal) {
  if (!apiKey) throw new Error("Claude search requires ANTHROPIC_API_KEY");
  const model = (typeof options?.claudeModel === "string" && options.claudeModel.trim()) || CLAUDE_DEFAULT_MODEL;
  const response = await fetch(claudeMessagesUrl(options?.claudeBaseUrl), {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": CLAUDE_DEFAULT_VERSION,
      "user-agent": "deepseek-harness/free-search",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: String(query) }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    }),
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(45000)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error("Anthropic API key is invalid (HTTP " + response.status + ") - update ANTHROPIC_API_KEY");
    }
    if (response.status === 429) {
      throw new Error("Anthropic rate limit or quota exceeded (HTTP 429) - check your Anthropic usage/limits");
    }
    throw new Error("Claude search API error (HTTP " + response.status + "): " + detail.slice(0, 200));
  }
  const data = await response.json();
  if (data?.error) {
    throw new Error("Claude response failed: " + (data.error.message ?? JSON.stringify(data.error).slice(0, 200)));
  }
  // web_search 的结果块 + 正文里的 citations
  const sources = [];
  for (const block of data.content ?? []) {
    if (block?.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const hit of block.content) {
        if (hit?.type !== "web_search_result" || typeof hit.url !== "string" || !hit.url) continue;
        sources.push({
          url: hit.url,
          ...(hit.title ? { title: String(hit.title) } : {}),
          ...(hit.page_age ? { publishedAt: String(hit.page_age) } : {}),
        });
      }
    }
    if (block?.type === "text" && Array.isArray(block.citations)) {
      for (const citation of block.citations) {
        if (citation?.type !== "web_search_result_location" || typeof citation.url !== "string" || !citation.url) continue;
        sources.push({ url: citation.url, ...(citation.title ? { title: String(citation.title) } : {}) });
      }
    }
  }
  return { sources: uniqueSources(sources, maxResults ?? 10), truncated: false };
}

// 火山引擎「联网搜索」（豆包搜索，AskEcho）：
// key = DOUBAO_SEARCH_API_KEY（联网搜索控制台 / Ark Coding Plan；每月 500 次免费额度）
// 注意：错误也返回 HTTP 200，必须解析 ResponseMetadata.Error。
// 时间过滤：OneDay | OneWeek | OneMonth | OneYear | "YYYY-MM-DD..YYYY-MM-DD"
