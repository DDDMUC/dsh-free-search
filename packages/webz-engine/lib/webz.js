// Webz.io News Search — the first optional external engine for dsh-free-search.
//
// Everything Webz-specific lives here: the endpoint, the Bearer token, the
// millisecond `ts` window, the 31-day history rule, and the `posts[]` shape.
// The core hands over `query / maxResults / timeRange / keys / fetch / signal`
// and nothing else, so none of these rules need to be known upstream.
//
// Docs: https://docs.webz.io/docs/webz/news-api-quickstart

const API_BASE = "https://api.webz.io";
const NEWS_PATH = "/api/news";

/** Webz caps `size` at 100. */
const MAX_SIZE = 100;
/** Posts asked for when the caller gives no usable count. */
const DEFAULT_SIZE = 20;
/** Without `ts` a request only covers the last 3 days. */
const DEFAULT_WINDOW_DAYS = 31;
/** A window starting further back than this needs `allowNewsHistory=true`. */
const HISTORY_DAYS = 31;
const DAY_MS = 86_400_000;

const CREDENTIAL = "WEBZ_API_TOKEN";

/** `timeRange` is `{ days }`, `{ after: "YYYY-MM-DD" }`, or undefined. */
export function windowStartMs(timeRange, now = Date.now()) {
  if (timeRange && typeof timeRange === "object") {
    if (typeof timeRange.after === "string" && timeRange.after) {
      const parsed = Date.parse(`${timeRange.after}T00:00:00Z`);
      if (Number.isFinite(parsed)) return parsed;
    }
    const days = Number(timeRange.days);
    if (Number.isFinite(days) && days > 0) return now - days * DAY_MS;
  }
  return now - DEFAULT_WINDOW_DAYS * DAY_MS;
}

/** Does this window need the paid history flag? */
export function needsNewsHistory(startMs, now = Date.now()) {
  return now - startMs > HISTORY_DAYS * DAY_MS;
}

/** Query string for GET /api/news. The token never goes here — it travels in a header. */
export function buildNewsQuery({ query, maxResults, timeRange, now = Date.now() }) {
  const startMs = windowStartMs(timeRange, now);
  const raw = Number(maxResults);
  // A missing, zero or negative count is meaningless, so it falls back to the
  // default rather than asking the API for a single post.
  const size = Number.isFinite(raw) && raw > 0
    ? Math.min(Math.round(raw), MAX_SIZE)
    : Math.min(DEFAULT_SIZE, MAX_SIZE);
  const params = new URLSearchParams({
    q: String(query ?? "").trim(),
    size: String(size),
    ts: String(Math.round(startMs)),
    // Relevance first: this is a search tool, not a feed reader.
    sort: "relevancy",
  });
  if (needsNewsHistory(startMs, now)) params.set("allowNewsHistory", "true");
  return params.toString();
}

/** Most engines report publishedAt as YYYY-MM-DD; Webz sends full ISO 8601. */
export function isoDate(value) {
  if (typeof value !== "string" || value === "") return "";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Collapse whitespace and trim; Webz returns article bodies with line breaks. */
function flatten(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * `posts[]` → our `sources[]`. Pure, so it can be asserted without a network.
 * `summary` is already short and we prefer it; `text` is the full body.
 */
export function parseNewsResponse(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Webz.io returned malformed JSON");
  }
  const posts = data?.posts;
  if (!Array.isArray(posts)) {
    throw new Error("Webz.io response has no posts array");
  }
  const sources = [];
  for (const post of posts) {
    const url = flatten(post?.url);
    if (!url) continue;
    const snippet = flatten(post?.summary) || flatten(post?.text);
    const source = {
      url,
      title: flatten(post?.title) || flatten(post?.thread?.title) || url,
      snippet,
    };
    const publishedAt = isoDate(post?.published ?? post?.thread?.published);
    if (publishedAt) source.publishedAt = publishedAt;
    const site = flatten(post?.thread?.site);
    if (site) source.site = site;
    sources.push(source);
  }
  return {
    sources,
    truncated: Number(data?.more_results_available) > 0,
  };
}

/** Map HTTP failures onto messages the core's classifier understands. */
export function describeHttpFailure(status, detail) {
  const tail = flatten(detail).slice(0, 200);
  if (status === 401) {
    return `Webz.io auth failed (HTTP 401) — check ${CREDENTIAL}; a 401 also means this token is not subscribed to the News API`;
  }
  if (status === 402 || status === 403) {
    return `Webz.io rejected the request (HTTP ${status}) — the token has no News API access or is out of credits${tail ? `: ${tail}` : ""}`;
  }
  if (status === 429) {
    return "Webz.io rate limited (HTTP 429) — slow down or raise the plan's rate limit";
  }
  if (status === 400) {
    return `Webz.io rejected the query syntax (HTTP 400)${tail ? `: ${tail}` : ""}`;
  }
  return `Webz.io API error (HTTP ${status})${tail ? `: ${tail}` : ""}`;
}

export const freeSearchEngine = {
  apiVersion: 1,
  id: "webz",
  label: { zh: "Webz.io 新闻", en: "Webz.io News" },
  link: "https://app.webz.io/login/signup",
  // Webz understands a date window through `ts`, so this engine joins time-filtered searches.
  time: true,
  requiresKey: [CREDENTIAL],

  async search({ query, maxResults, timeRange, keys, fetch, signal }) {
    const token = keys?.[CREDENTIAL] ?? "";
    if (!token) throw new Error(`${CREDENTIAL} is not configured`);

    const url = `${API_BASE}${NEWS_PATH}?${buildNewsQuery({ query, maxResults, timeRange })}`;
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      headers: {
        accept: "application/json",
        // The token stays out of the URL so it never lands in a log or a cache key.
        authorization: `Bearer ${token}`,
        "user-agent": "deepseek-harness/free-search",
      },
      signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(describeHttpFailure(response.status, detail));
    }
    return parseNewsResponse(await response.text());
  },
};

export default freeSearchEngine;
