// Brave Search engine assertions: catalog/credential wiring, request shape, freshness
// mapping, error classification and response parsing (publishedAt normalised to ISO).
// Mocked fetch: no key, no network, no test framework.
// Run: node tools/assert-brave.mjs
import fs from "node:fs";
import {
  ALL_ENGINES,
  BRAVE_URL,
  DEFAULT_FALLBACK_ORDER,
  FREE_ENGINES,
  TIME_ENGINES,
  classifyFailure,
} from "../lib/index.js";
import { BRAVE_TIMEOUT_MS, braveFreshness, bravePublishedAt, parseBraveResponse, searchBrave } from "../lib/engines/brave.js";
import { REQUIRED_CREDENTIALS } from "../lib/multi_policy.js";

let pass = 0;
const failures = [];
const assert = (cond, name) => {
  if (cond) {
    pass += 1;
    console.log("  ok  " + name);
  } else {
    failures.push(name);
    console.log("  FAIL " + name);
  }
};
const section = (title) => console.log("\n== " + title + " ==");

const indexSrc = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
const clientSrc = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

const realFetch = globalThis.fetch;
let calls = [];
const capture = async (response, run) => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return typeof response === "function" ? response(url, init) : response;
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = realFetch;
  }
};
const okFetch = (body) => async (url, init) => {
  calls.push({ url: String(url), init });
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
};
const errFetch = (status, body) => async (url, init) => {
  calls.push({ url: String(url), init });
  return { ok: false, status, text: async () => body };
};
const errorOf = async (run) => {
  try {
    await run();
    return null;
  } catch (error) {
    return error;
  }
};
const NOW = Date.UTC(2026, 10, 15, 12); // fixed clock for relative dates

try {
  section("A. catalog and settings wiring");
  assert(ALL_ENGINES.includes("brave"), "brave is in the engine catalog");
  assert(TIME_ENGINES.includes("brave"), "brave is declared time-filter capable");
  assert(DEFAULT_FALLBACK_ORDER.includes("brave"), "brave is in the default fallback order");
  assert(
    DEFAULT_FALLBACK_ORDER.indexOf("brave") === DEFAULT_FALLBACK_ORDER.indexOf("parallel") + 1,
    "brave sits right after parallel in the default chain",
  );
  assert(!FREE_ENGINES.includes("brave"), "brave needs a key, so it is not a keyless engine");
  assert(
    JSON.stringify(REQUIRED_CREDENTIALS.brave) === '[{"env":"BRAVE_API_KEY","settings":"braveApiKey"}]',
    "multi_search knows brave needs BRAVE_API_KEY",
  );
  assert(/case "brave":/.test(indexSrc), "runEngineTest handles brave");
  assert(/brave: async \(\{ query, maxResults, timeRange, signal \}\)/.test(indexSrc), "the provider runner routes brave");
  assert(/"braveApiKey",/.test(indexSrc), "legacy config migration knows braveApiKey");
  assert(/\{ id: "brave", label: "Brave Search"/.test(clientSrc), "the settings page lists brave");
  assert(/\bbrave: \[braveKey, setBraveKey\]/.test(clientSrc), "the settings page has a brave key input");
  const hints = clientSrc.split("\n").filter((line) => line.includes("keyStorageCredHint: (c) =>"));
  assert(
    hints.length === 2 && hints.every((line) => line.includes('"brave"')),
    "both credential hints list brave",
  );

  section("B. request shape");
  const result = await capture(
    okFetch({
      web: {
        results: [
          { title: "A <b>bold</b>", url: "https://a.example/1", description: "snip <em>a</em>", page_age: "2026-11-10T00:00:00Z" },
          { title: "A dup", url: "https://a.example/1", description: "dup" },
          { title: "B", url: "https://b.example/2", description: "snip b", age: "2 days ago" },
        ],
      },
    }),
    () => searchBrave("deepseek harness", 50, "test-token", { days: 3 }),
  );
  const url = new URL(calls[0].url);
  assert(`${url.origin}${url.pathname}` === BRAVE_URL, "requests hit the Brave Search API endpoint");
  assert(url.searchParams.get("q") === "deepseek harness", "the query is passed in q");
  assert(url.searchParams.get("count") === "20", "count is clamped to Brave's 20-per-request cap");
  assert(url.searchParams.get("freshness") === "pw", "a 3-day window maps to pw");
  assert(calls[0].init.method === "GET", "the request uses GET");
  assert(calls[0].init.redirect === "error", "redirects are rejected");
  assert(calls[0].init.headers.accept === "application/json", "the Accept header asks for JSON");
  assert(calls[0].init.headers["x-subscription-token"] === "test-token", "the key travels in X-Subscription-Token");
  assert(calls[0].init.headers["user-agent"] === "deepseek-harness/free-search", "the plugin's own UA is used");
  assert(calls[0].init.signal instanceof AbortSignal, "the request carries a merged abort signal");
  assert(BRAVE_TIMEOUT_MS === 15000, "a single request is budgeted at 15s");
  assert(result.sources.length === 2, "duplicate URLs collapse into one source");
  assert(result.sources[0].title === "A bold", "HTML tags are stripped from titles");
  assert(result.sources[0].publishedAt === "2026-11-10", "page_age keeps its ISO date");
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  assert(result.sources[1].publishedAt === twoDaysAgo, "relative age text becomes an ISO date");

  await capture(okFetch({ web: { results: [] } }), () => searchBrave("q", 0, "k"));
  assert(new URL(calls[0].url).searchParams.get("count") === "1", "count has a floor of 1");
  assert(new URL(calls[0].url).searchParams.get("freshness") === null, "no time range means no freshness");

  const controller = new AbortController();
  await capture(okFetch({ web: { results: [] } }), () => searchBrave("q", 1, "k", undefined, controller.signal));
  controller.abort();
  assert(calls[0].init.signal.aborted === true, "caller aborts propagate through the merged signal");

  const missingKey = await errorOf(() => searchBrave("q", 1, ""));
  assert(/BRAVE_API_KEY/.test(missingKey?.message ?? ""), "a missing key fails fast with an actionable message");

  section("C. freshness mapping");
  assert(braveFreshness({ days: 1 }) === "pd", "1 day maps to pd");
  assert(braveFreshness({ days: 7 }) === "pw", "7 days map to pw");
  assert(braveFreshness({ days: 31 }) === "pm", "31 days map to pm");
  assert(braveFreshness({ days: 365 }) === "py", "365 days map to py");
  assert(braveFreshness({ days: 0 }) === undefined, "a zero window sends no freshness");
  assert(braveFreshness(undefined) === undefined, "no time range sends no freshness");
  assert(
    /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/.test(braveFreshness({ after: "2026-01-01" })),
    "an absolute after-date becomes a YYYY-MM-DDtoYYYY-MM-DD range",
  );

  section("D. response parsing and dates");
  assert(parseBraveResponse('{"web":{"results":[]}}').length === 0, "an empty result list yields no sources");
  assert(parseBraveResponse("{}").length === 0, "a missing web.results section yields no sources");
  assert(
    (await errorOf(() => parseBraveResponse("{oops"))) !== null,
    "malformed JSON is rejected instead of silently ignored",
  );
  assert(bravePublishedAt({ page_age: "2024-08-05T00:00:00Z", age: "2 days ago" }, NOW) === "2024-08-05", "page_age wins over age");
  assert(bravePublishedAt({ age: "About 3 hours ago" }, NOW) === "2026-11-15", "hour-level age text stays on the right day");
  assert(bravePublishedAt({ age: "2 weeks ago" }, NOW) === "2026-11-01", "week-level age text converts to an ISO date");
  assert(bravePublishedAt({ age: "Aug 5, 2024" }, NOW) === "2024-08-05", "absolute date text converts to an ISO date");
  assert(bravePublishedAt({ age: "sometime last spring" }, NOW) === "", "unparseable age text is dropped, not passed through");
  assert(bravePublishedAt({}, NOW) === "", "missing date fields stay empty");

  section("E. error classification");
  const classOf = async (status, body = "upstream detail") =>
    classifyFailure(await capture(errFetch(status, body), () => errorOf(() => searchBrave("q", 1, "k"))));
  assert((await classOf(401)).class === "auth", "HTTP 401 classifies as auth");
  assert((await classOf(403)).class === "auth", "HTTP 403 classifies as auth");
  const limited = await classOf(429);
  assert(limited.class === "transient" && limited.rateLimited === true, "HTTP 429 is a rate-limited transient failure");
  assert((await classOf(503)).class === "transient", "HTTP 5xx classifies as transient");

  const malformed = await capture({ ok: true, status: 200, text: async () => "{oops" }, () =>
    errorOf(() => searchBrave("q", 1, "k")),
  );
  assert(classifyFailure(malformed).class === "invalid-response", "a malformed payload classifies as invalid-response");

  const network = await capture(
    async () => {
      throw new TypeError("fetch failed");
    },
    () => errorOf(() => searchBrave("q", 1, "k")),
  );
  assert(classifyFailure(network).class === "transient", "a network error classifies as transient");

  const longBody = await capture(errFetch(502, "x".repeat(500)), () => errorOf(() => searchBrave("q", 1, "k")));
  assert(
    longBody.message.length === "Brave API error (HTTP 502): ".length + 200,
    "only the first 200 characters of an error body reach the message",
  );
} catch (error) {
  console.error(error);
  failures.push("unexpected exception");
} finally {
  globalThis.fetch = realFetch;
}

if (failures.length > 0) {
  console.log(`\nFAILED: ${failures.length} of ${pass + failures.length}`);
  process.exit(1);
}
console.log(`\nOK: ${pass} assertions passed`);
