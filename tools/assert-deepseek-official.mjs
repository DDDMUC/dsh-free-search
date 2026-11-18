// DeepSeek official web search: Anthropic Messages API + deepseek_web_search.
import assert from "node:assert/strict";
import fs from "node:fs";
import { searchDeepSeekOfficial } from "../lib/engines/deepseek-official.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const realFetch = globalThis.fetch;

await check("requests the documented web-tools shape", async () => {
  let url = null;
  let body = null;
  globalThis.fetch = async (nextUrl, init) => {
    url = String(nextUrl);
    body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [] }),
    };
  };
  try {
    await searchDeepSeekOfficial("q", 3, "key");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(url, "https://api.deepseek.com/anthropic/v1/messages");
  assert.equal(body.model, "deepseek-flash");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.deepEqual(body.tools, [{ type: "deepseek_web_search", name: "deepseek_web_search" }]);
  assert.equal(body.messages[0].role, "user");
});

await check("maps result title, snippet, site_name and page_age", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [
        {
          type: "web_search_tool_result",
          content: [
            {
              type: "web_search_result",
              url: "https://example.test/a",
              title: "A",
              snippet: "S",
              site_name: "Example News",
              page_age: "2026-11-18T00:00:00Z",
            },
          ],
        },
      ],
    }),
  });
  try {
    const result = await searchDeepSeekOfficial("q", 3, "key");
    assert.deepEqual(result.sources[0], {
      url: "https://example.test/a",
      title: "A",
      snippet: "S",
      site: "Example News",
      publishedAt: "2026-11-18T00:00:00Z",
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("falls back to citations when snippet is absent", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [
        {
          type: "web_search_tool_result",
          content: [{ type: "web_search_result", url: "https://example.test/b", title: "B" }],
        },
        {
          type: "text",
          citations: [{ url: "https://example.test/b", cited_text: "cited text" }],
        },
      ],
    }),
  });
  try {
    const result = await searchDeepSeekOfficial("q", 3, "key");
    assert.equal(result.sources[0].snippet, "cited text");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("source keeps the official web-tools engine documented in the repo", () => {
  const source = fs.readFileSync(new URL("../lib/engines/deepseek-official.js", import.meta.url), "utf8");
  assert.match(source, /deepseek_web_search/);
  assert.match(source, /deepseek-flash/);
});

console.log(`OK: ${checks} deepseek official checks passed`);
