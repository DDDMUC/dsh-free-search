// Baidu Qianfan search + chat/completions quota fallback.
import assert from "node:assert/strict";
import { searchBaidu } from "../lib/engines/baidu.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const realFetch = globalThis.fetch;
const refs = [{ url: "https://a.test/1", title: "A", content: "snippet a", date: "2026-11-01" }];

await check("the API key is required", async () => {
  await assert.rejects(() => searchBaidu("q", 5, ""), /BAIDU_API_KEY/);
});

await check("web_search is used first with the existing body", async () => {
  let url = null;
  let body = null;
  globalThis.fetch = async (nextUrl, init) => {
    url = String(nextUrl);
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ references: refs }) };
  };
  try {
    const result = await searchBaidu("q", 5, "key");
    assert.equal(url, "https://qianfan.baidubce.com/v2/ai_search/web_search");
    assert.deepEqual(body.messages, [{ content: "q", role: "user" }]);
    assert.equal(result.sources[0].url, "https://a.test/1");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("a 403 quota error falls back to chat/completions", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    if (calls.length === 1) return { ok: false, status: 403, text: async () => "quota" };
    return { ok: true, json: async () => ({ references: refs }) };
  };
  try {
    const result = await searchBaidu("q", 5, "key");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, "https://qianfan.baidubce.com/v2/ai_search/chat/completions");
    assert.equal(calls[1].body.stream, false);
    assert.deepEqual(calls[1].body.messages, [{ content: "q", role: "user" }]);
    assert.equal(result.sources.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("a results.code quota error also falls back", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return { ok: true, json: async () => ({ code: 50, message: "quota" }) };
    return { ok: true, json: async () => ({ references: refs }) };
  };
  try {
    const result = await searchBaidu("q", 5, "key");
    assert.equal(calls.length, 2);
    assert.equal(result.sources.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("an invalid key does not trigger the fallback", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: false, status: 401, text: async () => "bad key" };
  };
  try {
    await assert.rejects(() => searchBaidu("q", 5, "key"), /invalid/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("both endpoints failing reports both errors", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/web_search")) return { ok: false, status: 403, text: async () => "quota" };
    return { ok: false, status: 500, text: async () => "down" };
  };
  try {
    await assert.rejects(() => searchBaidu("q", 5, "key"), /chat fallback/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

console.log(`OK: ${checks} baidu checks passed`);
