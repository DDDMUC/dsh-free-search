// Perplexity engine.
import { uniqueSources } from "./shared.js";
import { stripTrackingParams } from "../url_norm.js";
import { proxyFetch } from "../proxy_fetch.js";

export const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
export const PERPLEXITY_DEFAULT_MODEL = "sonar";

const CUSTOM_SYSTEM_PROMPT =
  "Return a concise factual answer grounded in live web search, citing sources inline with exact Markdown links [Title](https://exact-url) and a Sources section. Never invent URLs.";

/**
 * Normalize an optional Perplexity / OpenAI-compatible chat completions endpoint.
 * Official Perplexity defaults to https://api.perplexity.ai/chat/completions;
 * custom gateways (e.g. local OpenAI proxies) resolve bare hosts to /v1/chat/completions
 * and path-prefixed bases (such as .../v1) to .../chat/completions.
 */
export function perplexityEndpoint(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return PERPLEXITY_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Perplexity endpoint is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Perplexity endpoint must be http(s)");
  }
  url.search = "";
  url.hash = "";
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/chat/completions")) {
    url.pathname = path;
  } else if (path === "" || path === "/") {
    url.pathname = url.hostname.toLowerCase() === "api.perplexity.ai" ? "/chat/completions" : "/v1/chat/completions";
  } else {
    url.pathname = `${path}/chat/completions`;
  }
  return url.toString().replace(/\/$/, "");
}

function cleanHttpUrl(rawUrl) {
  if (typeof rawUrl !== "string") return "";
  let url = rawUrl.trim();
  while (/[).,;!?\]'">]$/.test(url)) {
    if (url.endsWith(")") && /\([^)]*\)$/.test(url)) break;
    url = url.slice(0, -1);
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return stripTrackingParams(parsed.toString());
  } catch {
    return "";
  }
}

function appendCandidate(map, rawUrl, meta = {}) {
  const url = cleanHttpUrl(rawUrl);
  if (!url) return;
  const existing = map.get(url);
  if (!existing) {
    map.set(url, {
      url,
      ...(meta.title ? { title: String(meta.title).trim() } : {}),
      ...(meta.snippet ? { snippet: String(meta.snippet).trim() } : {}),
      ...(meta.date ? { publishedAt: String(meta.date).trim() } : {}),
    });
    return;
  }
  if (!existing.title && meta.title) existing.title = String(meta.title).trim();
  if (!existing.snippet && meta.snippet) existing.snippet = String(meta.snippet).trim();
  if (!existing.publishedAt && meta.date) existing.publishedAt = String(meta.date).trim();
}

/**
 * Extract sources from structured Perplexity citations/search_results, OpenAI-style
 * message annotations, and Markdown/bare URLs in the assistant message content.
 */
export function extractPerplexitySources(data, maxResults = 10) {
  const message = data?.choices?.[0]?.message ?? {};
  const answer = typeof message?.content === "string" ? message.content : "";
  const defaultSnippet = answer ? answer.slice(0, 200) : "";
  const collected = new Map();

  for (const list of [data?.citations, message?.citations, data?.search_results, message?.search_results]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string") {
        appendCandidate(collected, item, defaultSnippet ? { snippet: defaultSnippet } : {});
      } else if (item && typeof item === "object") {
        appendCandidate(collected, item.url || item.link || item.href, {
          title: item.title || item.name,
          snippet: item.snippet || defaultSnippet,
          date: item.date || item.published_at,
        });
      }
    }
  }

  if (Array.isArray(message?.annotations)) {
    for (const ann of message.annotations) {
      const citation = ann?.url_citation || ann;
      if (citation?.url) {
        appendCandidate(collected, citation.url, {
          title: citation.title,
          ...(defaultSnippet ? { snippet: defaultSnippet } : {}),
        });
      }
    }
  }

  // Fallback for OpenAI-compatible gateways that return cited links only inside `content`.
  if (answer) {
    for (const match of answer.matchAll(/^\s*\[[^\]]+\]:\s*(https?:\/\/\S+)(?:\s+["'(]([^"')]+)["')])?/gm)) {
      appendCandidate(collected, match[1], {
        ...(match[2] ? { title: match[2] } : {}),
        ...(defaultSnippet ? { snippet: defaultSnippet } : {}),
      });
    }
    for (const match of answer.matchAll(/\[([^\]\r\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g)) {
      const label = match[1].trim();
      appendCandidate(collected, match[2], {
        ...(/^\d+$/.test(label) ? {} : { title: label }),
        ...(defaultSnippet ? { snippet: defaultSnippet } : {}),
      });
    }
    for (const match of answer.matchAll(/https?:\/\/[^\s<>()[\]"'`]+/g)) {
      appendCandidate(collected, match[0], defaultSnippet ? { snippet: defaultSnippet } : {});
    }
  }

  return uniqueSources([...collected.values()], maxResults ?? 10);
}

function isAbortSignalLike(value) {
  return Boolean(value && typeof value === "object" && typeof value.aborted === "boolean" && typeof value.addEventListener === "function");
}

export async function searchPerplexity(query, maxResults, apiKey, optionsOrSignal, maybeSignal) {
  const options = isAbortSignalLike(optionsOrSignal) ? {} : (optionsOrSignal ?? {});
  const signal = isAbortSignalLike(optionsOrSignal) ? optionsOrSignal : maybeSignal;
  const rawBaseUrl = String(options.baseUrl ?? "").trim();
  const isCustomEndpoint = rawBaseUrl !== "";
  const endpoint = perplexityEndpoint(rawBaseUrl);
  const key = String(apiKey ?? "").trim();
  if (!key && !isCustomEndpoint) throw new Error("Perplexity search requires PERPLEXITY_API_KEY");

  const model = String(options.model ?? "").trim() || PERPLEXITY_DEFAULT_MODEL;
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    ...(key ? { authorization: `Bearer ${key}` } : {}),
  };
  const messages = isCustomEndpoint
    ? [
        { role: "system", content: CUSTOM_SYSTEM_PROMPT },
        { role: "user", content: String(query) },
      ]
    : [{ role: "user", content: String(query) }];

  const timeoutMs = isCustomEndpoint ? 45000 : 20000;
  // 内置超时（与外部 signal 组合）：调用方不传 signal 时也不会永久卡住
  const response = await proxyFetch(endpoint, {
    method: "POST",
    redirect: "error",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages,
    }),
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(timeoutMs)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Perplexity API key is invalid (HTTP ${response.status}) at ${endpoint} - check the key and optional custom endpoint in Settings > Plugins > Free Search`
      );
    }
    throw new Error(`Perplexity API error (HTTP ${response.status}) at ${endpoint}: ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content ?? "";
  return {
    content: answer,
    sources: extractPerplexitySources(data, maxResults ?? 10),
    truncated: false,
  };
}
