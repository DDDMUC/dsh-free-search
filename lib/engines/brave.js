// Brave Search engine (BRAVE_API_KEY).
// Docs: https://api-dashboard.search.brave.com/documentation/services/web-search
//
// Free plan gives $5 credit per month (~1,000 queries at $5/1k); no keyless tier,
// so quota exhaustion has to be handled by the caller (cooldown / next engine).

import { stripTags, uniqueSources } from "./shared.js";

export const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";

/** Map our timeRange shape onto Brave's freshness (pd/pw/pm/py or YYYY-MM-DDtoYYYY-MM-DD). */
export function braveFreshness(timeRange) {
  if (!timeRange) return undefined;
  if (typeof timeRange.after === "string" && timeRange.after) {
    const end = new Date().toISOString().slice(0, 10);
    return `${timeRange.after}to${end}`;
  }
  const days = Number(timeRange.days);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  if (days <= 1) return "pd";
  if (days <= 7) return "pw";
  if (days <= 31) return "pm";
  return "py";
}

/** Brave returns { web: { results: [{ title, url, description, age }] } }. */
export function parseBraveResponse(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Brave returned malformed JSON");
  }
  const rows = data?.web?.results;
  if (!Array.isArray(rows)) return [];
  return rows.map((item) => ({
    title: stripTags(String(item?.title ?? "")),
    url: String(item?.url ?? ""),
    snippet: stripTags(String(item?.description ?? "")),
    publishedAt: typeof item?.age === "string" ? item.age : "",
  }));
}

export async function searchBrave(query, maxResults, apiKey, timeRange, signal) {
  if (!apiKey) throw new Error("Brave search requires BRAVE_API_KEY");
  const count = Math.min(Math.max(maxResults ?? 10, 1), 20); // Brave caps count at 20
  const params = new URLSearchParams({ q: String(query).slice(0, 400), count: String(count) });
  const freshness = braveFreshness(timeRange);
  if (freshness !== undefined) params.set("freshness", freshness);

  const response = await fetch(`${BRAVE_URL}?${params.toString()}`, {
    method: "GET",
    redirect: "error",
    headers: {
      accept: "application/json",
      "x-subscription-token": apiKey,
      "user-agent": "deepseek-harness/free-search",
    },
    ...(signal !== undefined ? { signal } : {}),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Brave auth failed (HTTP ${response.status}) - check BRAVE_API_KEY`);
    }
    if (response.status === 429) {
      throw new Error("Brave rate limited (HTTP 429) - free plan includes $5 credit per month (~1000 queries)");
    }
    throw new Error(`Brave API error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const sources = uniqueSources(parseBraveResponse(await response.text())).slice(0, count);
  return { sources };
}
