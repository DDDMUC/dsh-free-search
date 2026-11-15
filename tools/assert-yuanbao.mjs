// Tencent Yuanbao Search (WSA API-key gateway).
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  searchYuanbao,
  parseYuanbaoPages,
  normalizeYuanbaoMode,
  yuanbaoTimeRange,
} from "../lib/engines/yuanbao.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const realFetch = globalThis.fetch;
const natural = JSON.stringify({
  title: "AI 新闻",
  url: "https://a.test/1",
  passage: "摘要内容",
  content: "正文",
  date: "2026/11/01 09:30:00",
  site: "示例站",
});
const vr = JSON.stringify({
  vr: true,
  display: { title: "腾讯股价", url: "https://b.test/2", date: "2026-11-02" },
});

await check("the API key is required", async () => {
  await assert.rejects(() => searchYuanbao("q", 5, ""), /TENCENTCLOUD_WSA_APIKEY/);
});

await check("the request carries bearer auth, mode, site and time range", async () => {
  let captured = null;
  let headers = null;
  let body = null;
  globalThis.fetch = async (url, init) => {
    captured = String(url);
    headers = init.headers;
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ Response: { Pages: [natural] } }) };
  };
  try {
    const result = await searchYuanbao("q", 5, "wsa-key", { mode: 2, site: "qq.com" }, { days: 7 });
    assert.equal(captured, "https://api.wsa.cloud.tencent.com/SearchPro");
    assert.equal(headers.authorization, "Bearer wsa-key");
    assert.equal(body.Query, "q");
    assert.equal(body.Mode, 2);
    assert.equal(body.Site, "qq.com");
    assert.equal(typeof body.FromTime, "number");
    assert.equal(typeof body.ToTime, "number");
    assert.equal(result.sources[0].url, "https://a.test/1");
    assert.equal(result.sources[0].snippet, "摘要内容");
    assert.equal(result.sources[0].publishedAt, "2026-11-01");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("natural and VR pages are both parsed", () => {
  const sources = parseYuanbaoPages([natural, vr]);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].title, "AI 新闻");
  assert.equal(sources[1].title, "腾讯股价");
  assert.equal(sources[1].url, "https://b.test/2");
  assert.equal(sources[1].publishedAt, "2026-11-02");
});

await check("mode and time mapping are normalized", () => {
  assert.equal(normalizeYuanbaoMode(1), 1);
  assert.equal(normalizeYuanbaoMode("2"), 2);
  assert.equal(normalizeYuanbaoMode(9), 0);
  assert.equal(normalizeYuanbaoMode(undefined), 0);
  assert.equal(yuanbaoTimeRange(undefined).FromTime, undefined);
  const range = yuanbaoTimeRange({ days: 30 });
  assert.equal(range.ToTime > range.FromTime, true);
  assert.equal(yuanbaoTimeRange({ after: "2026-01-01" }).FromTime, 1767225600);
});

await check("upstream and Response.Error failures are reported", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => "bad key" });
  await assert.rejects(() => searchYuanbao("q", 3, "k"), /invalid or unauthorized/);
  globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => "quota" });
  await assert.rejects(() => searchYuanbao("q", 3, "k"), /quota/);
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ Response: { Error: { Code: "UnauthorizedOperation", Message: "not enabled" } } }),
  });
  await assert.rejects(() => searchYuanbao("q", 3, "k"), /not enabled/);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(() => searchYuanbao("q", 3, "k"), /no Response/);
  globalThis.fetch = realFetch;
});

await check("the engine is registered everywhere and stays explicit-only", async () => {
  const meta = await import("../lib/engine_meta.js");
  assert.equal(meta.ALL_ENGINES.length, 40);
  assert.equal(meta.ALL_ENGINES.includes("yuanbao"), true);
  assert.equal(meta.TIME_ENGINES.includes("yuanbao"), true);
  assert.equal(meta.DEFAULT_FALLBACK_ORDER.includes("yuanbao"), false);
  assert.equal(meta.EXPLICIT_ONLY_ENGINES.includes("yuanbao"), true);
  const { REQUIRED_CREDENTIALS } = await import("../lib/multi_policy.js");
  assert.equal(REQUIRED_CREDENTIALS.yuanbao?.[0]?.env, "TENCENTCLOUD_WSA_APIKEY");
  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(index, /yuanbao: async \(/);
  assert.match(index, /case "yuanbao":/);
  assert.match(index, /yuanbaoMode: z\.number\(\)\.default\(0\)/);
  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /id: "yuanbao"/);
  assert.match(client, /yuanbaoModeLabel/);
  assert.match(client, /path: \["yuanbaoSite"\]/);
});

console.log(`OK: ${checks} yuanbao checks passed`);
