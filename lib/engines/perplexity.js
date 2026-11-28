// Perplexity and OpenAI-compatible realtime web-search engine.
import { uniqueSources } from "./shared.js";
import { stripTrackingParams } from "../url_norm.js";
import { proxyFetch } from "../proxy_fetch.js";

export const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
export const PERPLEXITY_DEFAULT_MODEL = "sonar";

const CUSTOM_SYSTEM_PROMPT =
  "Return a concise factual answer grounded in live web search, citing sources inline with exact Markdown links [Title](https://exact-url) and a Sources section. Never invent URLs.";

function needsWebSearchOptions(model) {
  return /(?:search-preview|search-api)/i.test(String(model ?? ""));
}

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
  if (url.username || url.password) throw new Error("Perplexity endpoint must not contain credentials");
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
  url = url.replace(/[.,;:!?。 ，；！？]+$/u, "");
  for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
    while (url.endsWith(close) && url.split(close).length > url.split(open).length) url = url.slice(0, -1);
  }
  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) return "";
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
 * Extract sources across Perplexity `citations`/`search_results`, OpenAI/OpenRouter
 * `url_citation` annotations, Gemini `groundingMetadata`, and inline/reference URLs.
 */
export function extractPerplexitySources(data, maxResults = 10) {
  const choice = data?.choices?.[0] ?? {};
  const message = choice?.message ?? {};
  const answer = typeof message?.content === "string" ? message.content : "";
  const defaultSnippet = answer ? answer.slice(0, 200) : "";
  const collected = new Map();

  for (const list of [data?.citations, message?.citations, data?.search_results, message?.search_results]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string") {
        appendCandidate(collected, item);
      } else if (item && typeof item === "object") {
        appendCandidate(collected, item.url || item.link || item.href || item.uri, {
          title: item.title || item.name,
          snippet: item.snippet || item.content,
          date: item.date || item.published_at,
        });
      }
    }
  }

  for (const anns of [message?.annotations, choice?.annotations, data?.annotations]) {
    if (!Array.isArray(anns)) continue;
    for (const ann of anns) {
      const citation = ann?.url_citation || ann;
      if (citation?.url) {
        appendCandidate(collected, citation.url, {
          title: citation.title,
          snippet: citation.content || citation.snippet,
        });
      }
    }
  }

  for (const gm of [data?.groundingMetadata, choice?.groundingMetadata, message?.groundingMetadata, data?.candidates?.[0]?.groundingMetadata]) {
    if (!Array.isArray(gm?.groundingChunks)) continue;
    for (const chunk of gm.groundingChunks) {
      const web = chunk?.web || chunk?.retrievedContext;
      if (web?.uri) {
        appendCandidate(collected, web.uri, { title: web.title });
      }
    }
  }

  // Fallback for OpenAI-compatible gateways that return cited links only inside `content`.
  if (answer && collected.size === 0) {
    for (const match of answer.matchAll(/^\s*\[[^\]]+\]:\s*(https?:\/\/\S+)(?:\s+["'(]([^"')]+)["')])?/gm)) {
      appendCandidate(collected, match[1], match[2] ? { title: match[2] } : {});
    }
    for (const match of answer.matchAll(/\[([^\]\r\n]{1,200})\]\((https?:\/\/[^\s<>"'`]+)\)/g)) {
      const label = match[1].trim();
      appendCandidate(collected, match[2], /^\d+$/.test(label) ? {} : { title: label });
    }
    for (const match of answer.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
      appendCandidate(collected, match[0]);
    }
  }

  const enriched = [...collected.values()].map((entry) =>
    !entry.snippet && defaultSnippet ? { ...entry, snippet: defaultSnippet } : entry
  );
  return uniqueSources(enriched, maxResults ?? 10);
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
  let response;
  try {
    response = await proxyFetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages,
        ...(needsWebSearchOptions(model) ? { web_search_options: { search_context_size: "medium" } } : {}),
      }),
      signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(timeoutMs)]),
    });
  } catch {
    throw new Error(signal?.aborted ? "Perplexity request aborted" : "Perplexity request failed");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Perplexity API key is invalid (HTTP ${response.status}) - check the key and optional custom endpoint in Settings > Plugins > Free Search`
      );
    }
    throw new Error(`Perplexity API error (HTTP ${response.status})`);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Perplexity invalid response: expected JSON"); }
  const answer = data?.choices?.[0]?.message?.content;
  const message = data?.choices?.[0]?.message;
  const lists = [data?.citations, data?.search_results, data?.annotations, message?.citations, message?.search_results, message?.annotations, data?.choices?.[0]?.annotations];
  if (!data || typeof data !== "object" || Array.isArray(data) || data.error || !Array.isArray(data.choices) || typeof answer !== "string" || lists.some((list) => list != null && !Array.isArray(list))) {
    throw new Error("Perplexity invalid response");
  }
  return {
    content: answer,
    sources: extractPerplexitySources(data, maxResults ?? 10),
    truncated: false,
  };
}
