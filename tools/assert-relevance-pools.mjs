// #132/#133: relevance guard outside bing, doctor truthfulness, and pool-aware cache keys.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const { buildDoctorReport } = await import(new URL("lib/doctor.js", root));
const { buildCacheKey } = await import(new URL("lib/index.js", root));
const { searchAnysearch } = await import(new URL("lib/engines/anysearch.js", root));

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const irrelevant = [
  { title: "我们的猜想：战神不会死，等待它的将是一次超越一切的重生", snippet: "日产 GT-R", url: "https://www.cqvip.com/a" },
  { title: "陆地巡洋舰：2010 TRIUMPH THUNDERBIRD 1600", snippet: "雷鸟 凯旋摩托车", url: "https://www.cqvip.com/b" },
  { title: "混搭达人（BMW 3 系 GT 导购）", snippet: "", url: "https://www.cqvip.com/c" },
  { title: "四款 GeForce GT240 显卡新品齐亮相", snippet: "", url: "https://www.cqvip.com/d" },
  { title: "视觉享受 价该多高——显示卡个性竞技", snippet: "", url: "https://www.cqvip.com/e" },
];

await check("AnySearch drops a whole batch that does not match the query", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 0, data: { results: irrelevant } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  try {
    const result = await searchAnysearch("雷鸟GT Max 双11 到手价 值得买吗", 5, undefined, "key");
    assert.deepEqual(result.sources, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await check("AnySearch keeps results that match the query", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 0,
    data: {
      results: [
        { title: "雷鸟 GT Max AR 眼镜 双11 到手价 2209 元", snippet: "RayNeo GT Max 值得买吗", url: "https://smzdm.com/p/1" },
        { title: "雷鸟 GT Max 京东双十一战报", snippet: "雷鸟 GT Max 到手价", url: "https://jd.com/p/2" },
      ],
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await searchAnysearch("雷鸟GT Max 双11 到手价 值得买吗", 5, undefined, "key");
    assert.equal(result.sources.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await check("the guard lives in shared.js and is used by the noisy engines", () => {
  const shared = fs.readFileSync(new URL("lib/engines/shared.js", root), "utf8");
  assert.match(shared, /export function looksRelevant/);
  for (const file of ["anysearch.js", "searxng.js", "ddg.js", "ddg-lite.js", "degoog.js", "keenable.js"]) {
    const source = fs.readFileSync(new URL(`lib/engines/${file}`, root), "utf8");
    assert.match(source, /looksRelevant/, `${file} does not use the relevance guard`);
  }
});

await check("doctor reports the geo default instead of claiming auto", () => {
  const report = buildDoctorReport({ provider: "", effectiveProvider: "bing", poolsConfigured: true });
  assert.match(report, /preferred: geo default \(bing\)/);
  assert.doesNotMatch(report, /preferred: auto \(resolves to/);
  assert.match(report, /language pools/);
});

await check("the cache key changes with either language pool", () => {
  const base = ["q", 5, "", "auto", [], [], [], 0, 1];
  const zhA = buildCacheKey(...base, ["bing", "exa"], ["bing", "tavily"]);
  const zhB = buildCacheKey(...base, ["exa", "bing"], ["bing", "tavily"]);
  const enB = buildCacheKey(...base, ["bing", "exa"], ["tavily", "bing"]);
  assert.notEqual(zhA, zhB);
  assert.notEqual(zhA, enB);
  assert.equal(zhA, buildCacheKey(...base, ["bing", "exa"], ["bing", "tavily"]));
});

console.log(`OK: ${checks} relevance/pool checks passed`);
