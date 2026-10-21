// You.com 引擎断言：无 key 走免 key 档、有 key 走官方 Search API、YDC_API_KEY 为标准名且 YOUCOM_API_KEY 继续兼容、
// You.com 请求沿用插件自身 UA（不追加集成标识）、失败消息能被 classifyFailure 正确分类。
// 用 mock fetch，不需要 key、不发起网络请求、不依赖测试框架。
// 运行（Node >= 20，git clone 后 `npm install`）：
//   node tools/assert-youcom.mjs
// 全部通过输出 `OK: N assertions passed` 并以 0 退出；任何失败以 1 退出并列出失败项。

import {
  searchYoucom,
  resolveYoucomApiKey,
  classifyFailure,
  DEFAULT_FALLBACK_ORDER,
  YOUCOM_FREE_URL,
  YOUCOM_URL,
} from "../lib/index.js";

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
const section = (t) => console.log("\n== " + t + " ==");

const realFetch = globalThis.fetch;
let calls = [];
const mockFetch = (status, body) => async (url, init) => {
  calls.push({ url: String(url), init });
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
};
const WEB = {
  results: {
    web: [
      { url: "https://a.example/", title: "A", description: "desc a", snippets: ["snip a1", "snip a2"] },
      { url: "https://b.example/", title: "B", description: "desc b" },
      { title: "no url, dropped" },
      { url: "https://a.example/", title: "A dup" },
    ],
  },
};
const errorOf = async (fn) => {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
};

try {
  // ---------- A. 无 key：免 key 档 ----------
  section("A. 无 key 走 api.you.com/v1/agents/search");
  calls = [];
  globalThis.fetch = mockFetch(200, WEB);
  const free = await searchYoucom("deepseek harness", 5, "");
  const freeUrl = new URL(calls[0].url);
  assert(calls.length === 1 && `${freeUrl.origin}${freeUrl.pathname}` === YOUCOM_FREE_URL, "无 key 请求免 key 端点");
  assert(freeUrl.searchParams.get("query") === "deepseek harness" && freeUrl.searchParams.get("count") === "5", "query / count 参数");
  assert(!("X-API-Key" in calls[0].init.headers), "无 key 不发送 X-API-Key");
  assert(calls[0].init.redirect === "error", "拒绝重定向");
  assert(free.sources.length === 2, "丢弃无 url 结果并按 url 去重");
  assert(free.sources[0].snippet === "snip a1 snip a2" && free.sources[1].snippet === "desc b", "snippets 合并，缺省回退 description");

  // ---------- B. 有 key：官方 Search API ----------
  section("B. 有 key 走 ydc-index.io/v1/search");
  calls = [];
  globalThis.fetch = mockFetch(200, WEB);
  await searchYoucom("q", 50, "k-123");
  const keyedUrl = new URL(calls[0].url);
  assert(`${keyedUrl.origin}${keyedUrl.pathname}` === YOUCOM_URL, "有 key 请求 Search API");
  assert(calls[0].init.headers["X-API-Key"] === "k-123", "X-API-Key 头");
  assert(keyedUrl.searchParams.get("count") === "20", "count 上限 20");

  // ---------- C. User-Agent ----------
  section("C. User-Agent");
  assert(calls[0].init.headers["user-agent"] === "deepseek-harness/free-search", "You.com 请求沿用插件自身 UA，不追加集成标识");

  // ---------- D. key 解析：YDC_API_KEY 标准名 + YOUCOM_API_KEY 别名 ----------
  section("D. key 解析");
  const cred = (map) => async (ref) => map[ref] ?? "";
  assert((await resolveYoucomApiKey({ env: { YDC_API_KEY: "ydc" } })) === "ydc", "环境变量 YDC_API_KEY");
  assert((await resolveYoucomApiKey({ env: { YOUCOM_API_KEY: "old" } })) === "old", "旧名 YOUCOM_API_KEY 继续生效");
  assert((await resolveYoucomApiKey({ env: { YDC_API_KEY: "ydc", YOUCOM_API_KEY: "old" } })) === "ydc", "两者都有时 YDC_API_KEY 优先");
  assert((await resolveYoucomApiKey({ resolveCredential: cred({ YOUCOM_API_KEY: "c-old" }), env: { YDC_API_KEY: "e" } })) === "c-old", "凭据中心（旧名）优先于环境变量，与其它引擎一致");
  assert((await resolveYoucomApiKey({ resolveCredential: cred({ YDC_API_KEY: "c-ydc", YOUCOM_API_KEY: "c-old" }) })) === "c-ydc", "凭据中心内 YDC_API_KEY 优先");
  assert((await resolveYoucomApiKey({ resolveCredential: cred({}), settingsValue: "s", env: { YDC_API_KEY: "e" } })) === "s", "设置页 youcomApiKey 优先于环境变量");
  assert((await resolveYoucomApiKey({ resolveCredential: cred({}), env: {} })) === "", "都没有时返回空串（走免 key 档）");

  // ---------- E. 失败分类 ----------
  section("E. 失败分类");
  globalThis.fetch = mockFetch(429, "slow down");
  const free429 = await errorOf(() => searchYoucom("q", 5, ""));
  assert(free429 && /YDC_API_KEY/.test(free429.message), "免 key 档 429 提示设置 YDC_API_KEY");
  assert(free429 && classifyFailure(free429).class === "transient" && classifyFailure(free429).rateLimited === true, "免 key 档 429 → transient（短退避）");
  globalThis.fetch = mockFetch(401, "bad key");
  const keyed401 = await errorOf(() => searchYoucom("q", 5, "bad"));
  assert(keyed401 && classifyFailure(keyed401).class === "auth", "有 key 401 → auth");
  globalThis.fetch = mockFetch(402, "pay");
  const keyed402 = await errorOf(() => searchYoucom("q", 5, "k"));
  assert(keyed402 && classifyFailure(keyed402).class === "quota", "402 → quota");
  globalThis.fetch = mockFetch(503, "down");
  const free503 = await errorOf(() => searchYoucom("q", 5, ""));
  assert(free503 && classifyFailure(free503).class === "transient", "5xx → transient");

  // ---------- F. 回退链位置 ----------
  section("F. 回退链");
  assert(
    DEFAULT_FALLBACK_ORDER.indexOf("you") === DEFAULT_FALLBACK_ORDER.indexOf("deepseek-official") + 1 &&
      DEFAULT_FALLBACK_ORDER.indexOf("baidu") === DEFAULT_FALLBACK_ORDER.indexOf("you") + 1,
    "you 保持原有回退位置（deepseek-official 与 baidu 之间），不改变默认回退顺序"
  );
} finally {
  globalThis.fetch = realFetch;
}

console.log("");
if (failures.length === 0) {
  console.log(`OK: ${pass} assertions passed`);
} else {
  console.log(`FAILED: ${failures.length} of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
