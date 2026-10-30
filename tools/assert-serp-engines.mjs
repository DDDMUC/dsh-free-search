// HTML SERP 引擎（12 个）的纯函数断言：不需要 key、不发起网络请求、不依赖测试框架。
//
// 运行（Node >= 20）：
//   node tools/assert-serp-engines.mjs
//
// 与 tools/assert-engines.mjs 互补：那个测 API 引擎与路由，这个测 lib/serp_engines.js
// 本身，以及它在 lib/index.js 里的四处注册点（ALL_ENGINES / TIME_ENGINES /
// normalizeFallbackOrder / routeEngines）。index.js 需要宿主依赖，解析不到时自动 SKIP
// 集成段（clone 后 `npm install` 即可全跑）。
//
// 全部通过输出 `OK: N assertions passed` 并以 0 退出；任何失败以 1 退出并列失败项。
import {
  BLOCK_MARKERS,
  SERP_ENGINE_IDS,
  SERP_ENGINES,
  SERP_FAMILY,
  SERP_TIME_ENGINES,
  decodeEntities,
  findSerpEngine,
  isSerpEngine,
  searchSerpEngine,
  stripTags,
} from "../lib/serp_engines.js";

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
const same = (actual, expected, name) =>
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${name}（实际 ${JSON.stringify(actual)}）`);
const section = (t) => console.log("\n== " + t + " ==");

const EXPECTED_IDS = [
  "baidu-html",
  "so360",
  "sogou",
  "wechat",
  "toutiao",
  "jisilu",
  "google",
  "google-hk",
  "yahoo",
  "brave",
  "startpage",
  "qwant",
];

// ---------- A. 注册表不变式 ----------
section("A. SERP 注册表");
same(SERP_ENGINE_IDS, EXPECTED_IDS, "12 个 HTML 引擎，顺序固定（设置页顺序即此顺序）");
same(SERP_ENGINES.map((engine) => engine.id), EXPECTED_IDS, "SERP_ENGINES 与 SERP_ENGINE_IDS 一一对应");
assert(new Set(SERP_ENGINE_IDS).size === SERP_ENGINE_IDS.length, "id 无重复");
same([...SERP_FAMILY].sort(), [...EXPECTED_IDS].sort(), "SERP_FAMILY 覆盖全部 12 个 id");
assert(
  SERP_ENGINES.every(
    (engine) =>
      typeof engine.label === "string" &&
      engine.label.length > 0 &&
      ["cn", "global"].includes(engine.region) &&
      typeof engine.url === "function" &&
      typeof engine.parse === "function"
  ),
  "每个引擎都有 label / region / url() / parse()"
);
assert(
  SERP_ENGINES.every((engine) => /^https:\/\//.test(engine.url("测试 query"))),
  "url() 一律返回 https 绝对地址"
);
assert(isSerpEngine("baidu-html") && isSerpEngine("qwant"), "isSerpEngine 认得家族成员");
assert(!isSerpEngine("baidu") && !isSerpEngine("bing") && !isSerpEngine("multi"), "isSerpEngine 不把 API 引擎当家族成员");
assert(findSerpEngine("nope") === undefined, "findSerpEngine 未知 id 返回 undefined");

// ---------- B. 时间过滤元数据 ----------
section("B. 时间过滤");
same(SERP_TIME_ENGINES, ["so360", "sogou", "google", "google-hk"], "仅 4 个引擎声明时间过滤");
assert(
  SERP_TIME_ENGINES.every((id) => ["bing", "ddg", "google", "generic"].includes(findSerpEngine(id).timeFilter)),
  "声明时间过滤的引擎都有合法 timeFilter"
);
assert(
  SERP_ENGINE_IDS.filter((id) => !SERP_TIME_ENGINES.includes(id)).every((id) => findSerpEngine(id).timeFilter === undefined),
  "未声明的引擎不带 timeFilter（避免给不支持的站点乱加参数）"
);

// ---------- C. 与 index.js 的集成（缺宿主依赖时 SKIP） ----------
section("C. index.js 集成");
let host = null;
try {
  host = await import("../lib/index.js");
} catch (error) {
  console.log("  SKIP 无法解析宿主依赖（" + String(error.message).split("\n")[0] + "）——在 clone + npm install 的仓库内可全跑");
}
if (host !== null) {
  const { ALL_ENGINES, normalizeFallbackOrder, routeEngines } = host;
  assert(ALL_ENGINES.length === 39, `ALL_ENGINES 27 + 12 = 39（实际 ${ALL_ENGINES.length}）`);
  assert(new Set(ALL_ENGINES).size === ALL_ENGINES.length, "ALL_ENGINES 合并后无重复 id");
  assert(EXPECTED_IDS.every((id) => ALL_ENGINES.includes(id)), "家族全部并入 ALL_ENGINES");
  assert(!EXPECTED_IDS.includes("baidu"), "HTML 版百度改名为 baidu-html，不与 API 版 baidu 撞 id");

  const tail = normalizeFallbackOrder([]);
  assert(tail.every((id) => !SERP_FAMILY.has(id)), "默认回退顺序尾部不含 HTML 家族（默认关）");
  assert(tail[0] === "exa", "默认回退顺序仍以 exa 开头（未破坏既有优先级）");

  const zhAuto = routeEngines("可转债 套利", {});
  assert(zhAuto.every((id) => !SERP_FAMILY.has(id)), "auto 路由默认不带 HTML 家族");
  const zhWithSerp = routeEngines("可转债 套利", { zhPool: ["bing", "sogou"] });
  assert(zhWithSerp.includes("sogou"), "显式放进语言池后才参与 auto 路由");
  const onlySerp = routeEngines("可转债 套利", { zhPool: ["wechat", "toutiao"] });
  assert(onlySerp.includes("wechat") && onlySerp.includes("toutiao"), "整池都是家族引擎时也照常生效");
}

// ---------- D. 解析器（内联 fixture，离线） ----------
section("D. 解析器");
const parse = (id, html) => findSerpEngine(id).parse(html);

const baidu = parse(
  "baidu-html",
  '<div class="result c-container"><h3><a href="https://example.com/a">标题一</a></h3><div class="content-right">摘要一</div></div>'
);
same(baidu, [{ title: "标题一", url: "https://example.com/a", snippet: "摘要一" }], "baidu-html 取 mu / h3 / content-right");

const sogou = parse("sogou", '<div class="vrwrap"><h3><a href="https://mp.weixin.qq.com/s?x=1">搜狗标题</a></h3></div>');
same(sogou, [{ title: "搜狗标题", url: "https://mp.weixin.qq.com/s?x=1", snippet: "" }], "sogou 按 vrwrap 切块");

const wechat = parse("wechat", '<li id="sogou_vr_11002601_box_0"><h3><a href="/link?url=ABC&token=1">公众号标题</a></h3></li>');
same(
  wechat,
  [{ title: "公众号标题", url: "https://weixin.sogou.com/link?url=ABC&token=1", snippet: "" }],
  "wechat 认 sogou_vr_11002601_box 块 + 相对签名链补全"
);

const toutiao = parse("toutiao", '{"title":"头条标题","article_url":"https://toutiao.com/group/123456/?upstream_biz=search"}');
same(toutiao, [{ title: "头条标题", url: "https://www.toutiao.com/group/123456/", snippet: "" }], "toutiao 从内嵌 JSON 取 title + article_url");

const jisilu = parse("jisilu", '<a href="/question/8888" class="title">可转债问题</a>');
same(jisilu, [{ title: "可转债问题", url: "https://www.jisilu.cn/question/8888", snippet: "" }], "jisilu 认 /question|subject/<id>");

const generic = parse(
  "brave",
  '<a href="https://support.microsoft.com/x">Edge</a><a href="https://example.com/ok">正常标题</a><a href="https://example.com/login">登录</a>'
);
same(generic, [{ title: "正常标题", url: "https://example.com/ok", snippet: "" }], "通用解析丢弃站点 chrome（厂商域名 + 导航词标题）");

same(parse("brave", "<html></html>"), [], "无结果时返回空数组（由 index.js 决定是否重试）");

// ---------- E. 反爬识别与文本清洗 ----------
section("E. 反爬与清洗");
assert(BLOCK_MARKERS.some((re) => re.test("请输入验证码后继续访问")), "识别中文验证码墙");
assert(BLOCK_MARKERS.some((re) => re.test("Our systems have detected unusual traffic")), "识别英文反爬墙");
assert(!BLOCK_MARKERS.some((re) => re.test("可转债 套利 策略 研究")), "正常查询结果页不误判");
same(stripTags("<b>粗</b> 体"), "粗 体", "stripTags 去标签保留文本");
same(decodeEntities("&amp;&lt;&#39;&quot;&nbsp;x"), "&<'\" x", "decodeEntities 解码实体与 &nbsp;");

// ---------- F. 失败语义 ----------
section("F. 失败语义");
await searchSerpEngine("nope", "x", {}).then(
  () => assert(false, "未知引擎应抛错"),
  (error) => assert(/unknown serp engine/.test(error.message), "未知引擎抛 unknown serp engine（便于定位拼写错误）")
);

// ---------- 汇总 ----------
console.log("");
if (failures.length > 0) {
  console.log(`FAILED: ${failures.length} assertion(s)`);
  for (const name of failures) console.log("  - " + name);
  process.exit(1);
}
console.log(`OK: ${pass} assertions passed`);
