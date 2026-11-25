// Webz.io engine: request shape, time conversion, response mapping, failure text.
// Offline only — the network call is never made here.
import assert from "node:assert/strict";
import {
  buildNewsQuery,
  describeHttpFailure,
  freeSearchEngine,
  isoDate,
  needsNewsHistory,
  parseNewsResponse,
  windowStartMs,
} from "../packages/webz-engine/lib/webz.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

const NOW = Date.parse("2026-11-25T00:00:00Z");
const DAY = 86_400_000;

// ------------------------------------------------------------------ 契约
await check("the entry declares the apiVersion 1 contract", async () => {
  assert.equal(freeSearchEngine.apiVersion, 1);
  assert.equal(freeSearchEngine.id, "webz");
  assert.equal(typeof freeSearchEngine.search, "function");
  assert.equal(freeSearchEngine.time, true, "Webz understands a date window through ts");
  assert.deepEqual(freeSearchEngine.requiresKey, ["WEBZ_API_TOKEN"]);
  assert.equal(freeSearchEngine.label.en, "Webz.io News");
  assert.equal(freeSearchEngine.label.zh, "Webz.io 新闻");
});

// ------------------------------------------------------------------ 时间
await check("a relative window becomes ts = now - days", async () => {
  assert.equal(windowStartMs({ days: 7 }, NOW), NOW - 7 * DAY);
  assert.equal(windowStartMs({ days: 30 }, NOW), NOW - 30 * DAY);
});

await check("an absolute date becomes that day at 00:00Z", async () => {
  assert.equal(windowStartMs({ after: "2026-11-01" }, NOW), Date.parse("2026-11-01T00:00:00Z"));
});

await check("no time filter defaults to the last 31 days", async () => {
  assert.equal(windowStartMs(undefined, NOW), NOW - 31 * DAY);
  assert.equal(windowStartMs({}, NOW), NOW - 31 * DAY);
  assert.equal(windowStartMs({ days: 0 }, NOW), NOW - 31 * DAY);
  assert.equal(windowStartMs({ days: -5 }, NOW), NOW - 31 * DAY);
});

await check("the 31-day boundary decides allowNewsHistory", async () => {
  // Exactly 31 days back is still the cheap tier.
  assert.equal(needsNewsHistory(NOW - 31 * DAY, NOW), false, "31 days is inside the cheap window");
  // One day further needs the paid flag.
  assert.equal(needsNewsHistory(NOW - 32 * DAY, NOW), true, "32 days must set allowNewsHistory");
  assert.equal(needsNewsHistory(NOW - 400 * DAY, NOW), true);
});

// ------------------------------------------------------------------ 请求
await check("the query carries q, size, ts and sort", async () => {
  const query = new URLSearchParams(buildNewsQuery({ query: "ai news", maxResults: 10, timeRange: { days: 3 }, now: NOW }));
  assert.equal(query.get("q"), "ai news");
  assert.equal(query.get("size"), "10");
  assert.equal(query.get("ts"), String(NOW - 3 * DAY));
  assert.equal(query.get("sort"), "relevancy");
  assert.equal(query.get("allowNewsHistory"), null, "a 3-day window is inside the free tier");
});

await check("the token is never in the query string", async () => {
  const query = buildNewsQuery({ query: "x", maxResults: 5, timeRange: { days: 1 }, now: NOW });
  assert.equal(/token|api_?key|authorization/i.test(query), false, "no credential may appear in the URL");
});

await check("size is clamped to the API maximum of 100", async () => {
  assert.equal(new URLSearchParams(buildNewsQuery({ query: "x", maxResults: 500, now: NOW })).get("size"), "100");
  assert.equal(new URLSearchParams(buildNewsQuery({ query: "x", maxResults: 0, now: NOW })).get("size"), "20",
    "a zero/absent maxResults falls back to 20, not 1");
  assert.equal(new URLSearchParams(buildNewsQuery({ query: "x", maxResults: -5, now: NOW })).get("size"), "20");
});

await check("a window older than 31 days sets allowNewsHistory", async () => {
  const query = new URLSearchParams(buildNewsQuery({ query: "x", maxResults: 10, timeRange: { days: 90 }, now: NOW }));
  assert.equal(query.get("allowNewsHistory"), "true");
  assert.equal(query.get("ts"), String(NOW - 90 * DAY));
});

// ------------------------------------------------------------------ 响应
await check("posts map onto sources", async () => {
  const body = JSON.stringify({
    posts: [
      {
        url: "https://news.test/a",
        title: "A headline",
        summary: "A summary",
        published: "2026-11-20T10:15:00.000+03:00",
        thread: { site: "news.test" },
      },
      {
        url: "https://news.test/b",
        title: "B headline",
        text: "Full body text\n   with   newlines",
        published: "2026-11-19T00:00:00.000Z",
      },
    ],
    more_results_available: 120,
    requests_left: 990,
  });
  const result = parseNewsResponse(body);
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].url, "https://news.test/a");
  assert.equal(result.sources[0].snippet, "A summary");
  assert.equal(result.sources[0].publishedAt, "2026-11-20");
  assert.equal(result.sources[0].site, "news.test");
  // No summary -> the body text is used, with whitespace collapsed.
  assert.equal(result.sources[1].snippet, "Full body text with newlines");
  assert.equal(result.sources[1].publishedAt, "2026-11-19");
  assert.equal(result.truncated, true);
});

await check("truncated is false when nothing is left behind", async () => {
  const result = parseNewsResponse(JSON.stringify({ posts: [{ url: "https://a.test/1", title: "T" }], more_results_available: 0 }));
  assert.equal(result.truncated, false);
});

await check("posts without a url are dropped", async () => {
  const result = parseNewsResponse(
    JSON.stringify({ posts: [{ title: "no url" }, { url: "https://a.test/ok", title: "ok" }] }),
  );
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, "https://a.test/ok");
});

await check("malformed JSON and a missing posts array are reported", async () => {
  assert.throws(() => parseNewsResponse("not json"), /malformed JSON/);
  assert.throws(() => parseNewsResponse(JSON.stringify({})), /no posts array/);
  assert.throws(() => parseNewsResponse(JSON.stringify({ posts: {} })), /no posts array/);
});

await check("ISO dates normalise to YYYY-MM-DD", async () => {
  assert.equal(isoDate("2026-11-20T10:15:00.000+03:00"), "2026-11-20");
  assert.equal(isoDate("2026-11-19T23:00:00.000-05:00"), "2026-11-20", "the date is the UTC date");
  assert.equal(isoDate(""), "");
  assert.equal(isoDate("nope"), "");
  assert.equal(isoDate(undefined), "");
});

// ------------------------------------------------------------------ 失败
await check("HTTP failures map onto useful messages", async () => {
  assert.match(describeHttpFailure(401, ""), /WEBZ_API_TOKEN/);
  assert.match(describeHttpFailure(401, ""), /not subscribed to the News API/);
  assert.match(describeHttpFailure(402, ""), /no News API access or is out of credits/);
  assert.match(describeHttpFailure(429, ""), /rate limited/);
  assert.match(describeHttpFailure(400, "bad syntax"), /query syntax/);
  assert.match(describeHttpFailure(400, "bad syntax"), /bad syntax/);
  assert.match(describeHttpFailure(500, ""), /HTTP 500/);
});

await check("a missing token fails before any request is made", async () => {
  let called = false;
  const fetch = () => { called = true; throw new Error("should not be reached"); };
  await assert.rejects(
    freeSearchEngine.search({ query: "q", maxResults: 5, keys: {}, fetch }),
    /WEBZ_API_TOKEN is not configured/,
  );
  assert.equal(called, false, "the engine must not call out without a credential");
});

// ------------------------------------------------------------------ 端到端（假 fetch）
await check("a full call passes the token in a header and parses the response", async () => {
  let seen = null;
  const fetch = async (url, init) => {
    seen = { url, init };
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          posts: [{ url: "https://news.test/ok", title: "OK", summary: "S", published: "2026-11-20T00:00:00Z" }],
          more_results_available: 0,
        });
      },
    };
  };
  const result = await freeSearchEngine.search({
    query: "ai",
    maxResults: 5,
    timeRange: { days: 2 },
    keys: { WEBZ_API_TOKEN: "secret-token" },
    fetch,
  });
  assert.ok(seen.url.startsWith("https://api.webz.io/api/news?"), `unexpected url: ${seen.url}`);
  assert.equal(seen.init.method, "GET");
  assert.equal(seen.init.headers.authorization, "Bearer secret-token");
  assert.equal(seen.init.headers.accept, "application/json");
  assert.equal(/secret-token/.test(seen.url), false, "the token must not leak into the URL");
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].publishedAt, "2026-11-20");
});

await check("an HTTP error becomes a throw with a classified message", async () => {
  const fetch = async () => ({ ok: false, status: 429, async text() { return "slow down"; } });
  await assert.rejects(
    freeSearchEngine.search({ query: "q", maxResults: 5, keys: { WEBZ_API_TOKEN: "t" }, fetch }),
    /rate limited/,
  );
});

console.log(`OK: ${checks} webz engine checks passed`);
