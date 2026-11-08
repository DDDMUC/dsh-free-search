// Google Programmable Search (Custom Search JSON API) engine.
import assert from "node:assert/strict";
import fs from "node:fs";
import { searchGoogle, googleDateRestrict } from "../lib/engines/google.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const realFetch = globalThis.fetch;

await check("the API key and the search engine id are both required", async () => {
  await assert.rejects(() => searchGoogle("q", 5, "", "cx"), /GOOGLE_CSE_API_KEY/);
  await assert.rejects(() => searchGoogle("q", 5, "key", ""), /googleCseId/);
});

await check("the request carries the query, key, cx, locale and filters", async () => {
  let captured = null;
  globalThis.fetch = async (url) => {
    captured = new URL(String(url));
    return {
      ok: true,
      json: async () => ({
        items: [
          { title: "Result A", link: "https://a.test/1", snippet: "snippet a", pagemap: { metatags: [{ "article:published_time": "2026-10-01T10:00:00Z" }] } },
          { title: "Result B", link: "https://b.test/2", snippet: "snippet b" },
        ],
      }),
    };
  };
  try {
    const result = await searchGoogle("hello world", 5, "cse-key", "cx-123", { days: 7 }, { lang: "zh", safeSearch: "strict" });
    assert.equal(captured.origin + captured.pathname, "https://www.googleapis.com/customsearch/v1");
    assert.equal(captured.searchParams.get("key"), "cse-key");
    assert.equal(captured.searchParams.get("cx"), "cx-123");
    assert.equal(captured.searchParams.get("q"), "hello world");
    assert.equal(captured.searchParams.get("num"), "5");
    assert.equal(captured.searchParams.get("start"), "1");
    assert.equal(captured.searchParams.get("hl"), "zh-CN");
    assert.equal(captured.searchParams.get("safe"), "active");
    assert.equal(captured.searchParams.get("dateRestrict"), "d7");
    assert.equal(result.sources.length, 2);
    assert.equal(result.sources[0].url, "https://a.test/1");
    assert.equal(result.sources[0].publishedAt, "2026-10-01");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("more than ten results paginate in pages of ten", async () => {
  const starts = [];
  globalThis.fetch = async (url) => {
    const params = new URL(String(url)).searchParams;
    starts.push({ start: params.get("start"), num: params.get("num") });
    const count = Number(params.get("num"));
    return {
      ok: true,
      json: async () => ({ items: Array.from({ length: count }, (_, i) => ({ title: `t${starts.length}-${i}`, link: `https://x.test/${starts.length}/${i}` })) }),
    };
  };
  try {
    const result = await searchGoogle("q", 15, "k", "cx");
    assert.deepEqual(starts, [{ start: "1", num: "10" }, { start: "11", num: "5" }]);
    assert.equal(result.sources.length, 15);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("upstream errors name the failure class", async () => {
  const reply = (status, body) => async () => ({ ok: false, status, text: async () => JSON.stringify(body) });
  globalThis.fetch = reply(403, { error: { message: "Custom Search API has not been used" } });
  await assert.rejects(() => searchGoogle("q", 5, "k", "cx"), /not enabled/);
  globalThis.fetch = reply(429, { error: { message: "quota" } });
  await assert.rejects(() => searchGoogle("q", 5, "k", "cx"), /quota exceeded/);
  globalThis.fetch = reply(400, { error: { message: "invalid cx" } });
  await assert.rejects(() => searchGoogle("q", 5, "k", "cx"), /check GOOGLE_CSE_API_KEY and googleCseId/);
  globalThis.fetch = realFetch;
});

await check("time ranges map to the CSE dateRestrict grammar", () => {
  assert.equal(googleDateRestrict({ days: 1 }), "d1");
  assert.equal(googleDateRestrict({ days: 7 }), "d7");
  assert.equal(googleDateRestrict({ days: 31 }), "d31");
  assert.equal(googleDateRestrict({ days: 60 }), "m2");
  assert.equal(googleDateRestrict({ days: 365 }), "m13");
  assert.equal(googleDateRestrict({ after: "2026-01-01" }), "");
  assert.equal(googleDateRestrict(undefined), "");
});

await check("the engine is registered everywhere", async () => {
  const meta = await import("../lib/engine_meta.js");
  assert.equal(meta.ALL_ENGINES.includes("google"), true);
  assert.equal(meta.TIME_ENGINES.includes("google"), true);
  assert.equal(meta.DEFAULT_FALLBACK_ORDER.includes("google"), true);
  const { REQUIRED_CREDENTIALS } = await import("../lib/multi_policy.js");
  assert.equal(REQUIRED_CREDENTIALS.google?.[0]?.env, "GOOGLE_CSE_API_KEY");
  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(index, /google: async \(/);
  assert.match(index, /case "google":/);
  assert.match(index, /googleCseApiKey/);
  assert.match(index, /googleCseId/);
  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /id: "google"/);
  assert.match(client, /googleCseIdLabel/);
});

console.log(`OK: ${checks} google-cse checks passed`);
