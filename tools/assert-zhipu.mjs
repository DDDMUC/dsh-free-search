// Zhipu Web Search API: catalog wiring, request shape, recency mapping, parsing and errors.
import assert from "node:assert/strict";
import {
  ALL_ENGINES,
  DEFAULT_FALLBACK_ORDER,
  TIME_ENGINES,
  classifyFailure,
} from "../lib/index.js";
import { searchZhipu, zhipuRecency } from "../lib/engines/zhipu.js";

let pass = 0;
const failures = [];
const check = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log("  ok  " + name);
  } catch (error) {
    failures.push(name);
    console.log("  FAIL " + name + " — " + error.message);
  }
};
const asyncCheck = async (name, fn) => {
  try {
    await fn();
    pass += 1;
    console.log("  ok  " + name);
  } catch (error) {
    failures.push(name);
    console.log("  FAIL " + name + " — " + error.message);
  }
};

check("catalog and default fallback include zhipu", () => {
  assert.ok(ALL_ENGINES.includes("zhipu"));
  assert.ok(TIME_ENGINES.includes("zhipu"));
  assert.ok(DEFAULT_FALLBACK_ORDER.includes("zhipu"));
});

check("recency maps days to Zhipu filters", () => {
  assert.equal(zhipuRecency({ days: 1 }), "oneDay");
  assert.equal(zhipuRecency({ days: 3 }), "oneWeek");
  assert.equal(zhipuRecency({ days: 20 }), "oneMonth");
  assert.equal(zhipuRecency({ days: 400 }), "oneYear");
  assert.equal(zhipuRecency(undefined), "noLimit");
});

let calls = [];
const realFetch = globalThis.fetch;
const capture = async (response, run) => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return response;
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = realFetch;
  }
};
const ok = (body) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(body),
});

await asyncCheck("request carries key, engine, query and recency", async () => {
  const response = ok({
    search_result: [
      { title: "智谱结果", link: "https://example.com/a", content: "摘要内容", media: "示例", publish_date: "2026-11-01" },
      { title: "重复", link: "https://example.com/a", content: "dup" },
    ],
  });
  const result = await capture(response, () => searchZhipu("雷鸟 GT Max", 5, "zhipu-key", { days: 3 }, undefined, "search_pro"));
  const body = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].url, "https://open.bigmodel.cn/api/paas/v4/web_search");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer zhipu-key");
  assert.equal(body.search_query, "雷鸟 GT Max");
  assert.equal(body.search_engine, "search_pro");
  assert.equal(body.search_intent, false);
  assert.equal(body.search_recency_filter, "oneWeek");
  assert.equal(body.count, 5);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, "https://example.com/a");
  assert.equal(result.sources[0].title, "智谱结果");
  assert.equal(result.sources[0].snippet, "摘要内容");
  assert.equal(result.sources[0].publishedAt, "2026-11-01");
});

await asyncCheck("search_pro_sogou rounds count to its supported step", async () => {
  await capture(ok({ search_result: [] }), () => searchZhipu("q", 7, "k", undefined, undefined, "search_pro_sogou"));
  assert.equal(JSON.parse(calls[0].init.body).count, 10);
  await capture(ok({ search_result: [] }), () => searchZhipu("q", 11, "k", undefined, undefined, "search_pro_sogou"));
  assert.equal(JSON.parse(calls[0].init.body).count, 20);
});

await asyncCheck("errors map to auth/quota/transient classes", async () => {
  await capture({ ok: false, status: 401, text: async () => "bad key" }, async () => {
    const error = await searchZhipu("q", 3, "k").catch((e) => e);
    assert.equal(classifyFailure(error).class, "auth");
  });
  await capture({ ok: false, status: 429, text: async () => "concurrency limit" }, async () => {
    const error = await searchZhipu("q", 3, "k").catch((e) => e);
    assert.equal(classifyFailure(error).class, "transient");
  });
});

await asyncCheck("missing key fails fast", async () => {
  const error = await searchZhipu("q", 3, "").catch((e) => e);
  assert.match(error.message, /ZHIPU_API_KEY/);
});

if (failures.length > 0) {
  console.log(`\nFAILED: ${failures.length} of ${pass + failures.length}`);
  process.exit(1);
}
console.log(`\nOK: ${pass} zhipu checks passed`);
