// Metaso (秘塔搜索) official API engine.
import assert from "node:assert/strict";
import fs from "node:fs";
import { searchMetaso, normalizeMetasoScope, METASO_SCOPES } from "../lib/engines/metaso.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const realFetch = globalThis.fetch;

await check("the API key is required", async () => {
  await assert.rejects(() => searchMetaso("q", 5, "", "webpage"), /METASO_API_KEY/);
});

await check("the request carries key, query, scope and summary options", async () => {
  let captured = null;
  let body = null;
  globalThis.fetch = async (url, init) => {
    captured = String(url);
    body = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        webpages: [
          { title: "A", link: "https://a.test/1", summary: "summary a", snippet: "snippet a", date: "2026-11-01T08:00:00Z" },
          { title: "B", link: "https://b.test/2", snippet: "snippet b" },
          { title: "no link", summary: "dropped" },
        ],
      }),
    };
  };
  try {
    const result = await searchMetaso("hello", 5, "meta-key", "webpage");
    assert.equal(captured, "https://metaso.cn/api/v1/search");
    assert.equal(body.q, "hello");
    assert.equal(body.scope, "webpage");
    assert.equal(body.size, 5);
    assert.equal(body.includeSummary, true);
    assert.equal(body.includeRawContent, false);
    assert.equal(body.conciseSnippet, true);
    assert.equal(result.sources.length, 2);
    assert.equal(result.sources[0].snippet, "summary a");
    assert.equal(result.sources[0].publishedAt, "2026-11-01");
    assert.equal(result.sources[1].snippet, "snippet b");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("document scope reads the documents array and size is clamped", async () => {
  let body = null;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({ documents: [{ title: "Doc", link: "https://doc.test/x", summary: "doc summary" }] }),
    };
  };
  try {
    const result = await searchMetaso("q", 500, "k", "document");
    assert.equal(body.scope, "document");
    assert.equal(body.size, 50);
    assert.equal(result.sources[0].url, "https://doc.test/x");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("unknown scopes fall back to webpage", () => {
  assert.equal(normalizeMetasoScope("document"), "document");
  assert.equal(normalizeMetasoScope(" scholar "), "scholar");
  assert.equal(normalizeMetasoScope("video"), "webpage");
  assert.equal(normalizeMetasoScope(undefined), "webpage");
  assert.deepEqual(METASO_SCOPES, ["webpage", "document", "scholar"]);
});

await check("upstream errors name the failure class", async () => {
  const cases = [
    [401, /invalid/],
    [402, /credits/],
    [429, /quota/],
    [400, /check the API key and scope/],
  ];
  for (const [status, pattern] of cases) {
    globalThis.fetch = async () => ({ ok: false, status, text: async () => '{"message":"upstream detail"}' });
    await assert.rejects(() => searchMetaso("q", 3, "k", "webpage"), pattern);
  }
  globalThis.fetch = realFetch;
});

await check("the engine is registered everywhere and stays out of the default chain", async () => {
  const meta = await import("../lib/engine_meta.js");
  assert.equal(meta.ALL_ENGINES.includes("metaso"), true);
  assert.equal(meta.TIME_ENGINES.includes("metaso"), false);
  assert.equal(meta.DEFAULT_FALLBACK_ORDER.includes("metaso"), false);
  assert.equal(meta.EXPLICIT_ONLY_ENGINES.includes("metaso"), true);
  const { REQUIRED_CREDENTIALS } = await import("../lib/multi_policy.js");
  assert.equal(REQUIRED_CREDENTIALS.metaso?.[0]?.env, "METASO_API_KEY");
  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(index, /metaso: async \(/);
  assert.match(index, /case "metaso":/);
  assert.match(index, /metasoApiKey: "METASO_API_KEY"/);
  assert.match(index, /metasoScope: z\.string\(\)\.default\("webpage"\)/);
  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /id: "metaso"/);
  assert.match(client, /metasoScopeLabel/);
  assert.match(client, /metasoApiKey: "metaso"/);
  assert.match(client, /path: \["metasoScope"\]/);
});

console.log(`OK: ${checks} metaso checks passed`);
