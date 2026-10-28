// #58 评审意见 E 的可复现断言：语言分池路由 / 池配置 / FREE_ENGINES 口径。
// 纯函数断言，不需要 key、不发起网络请求、不依赖测试框架。
// 运行（Node >= 20，需要能解析 @deepseek-ai/{schemastery,dsh-tools,dsh-settings}，
// git clone 后 `npm install` 即满足；在 DSH 安装目录的插件包内也可直接跑）：
//   node tools/assert-engines.mjs
// 全部通过输出 `OK: N assertions passed` 并以 0 退出；任何失败以 1 退出并列出失败项。

import { FREE_ENGINES, ALL_ENGINES, TIME_ENGINES, DEFAULT_FALLBACK_ORDER, routeEngines, Config, stripZhihuTracking } from "../lib/index.js";
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
const section = (t) => console.log("\n== " + t + " ==");

// ---------- A. FREE_ENGINES 只含真正免 key 的引擎（意见 A） ----------
section("A. FREE_ENGINES");
assert(
  FREE_ENGINES.join(",") === "ddg,ddg-lite,bing,searxng,degoog,anysearch",
  "FREE_ENGINES = 6 个免 key 引擎（zhihu_* 需要 ZHIHU_API_KEY，不得进入；degoog 只需要自建实例）"
);
assert(
  !FREE_ENGINES.includes("zhihu_global") && !FREE_ENGINES.includes("zhihu_site"),
  "FREE_ENGINES 不含 zhihu_global / zhihu_site"
);

// ---------- B. 语言分池路由（意见 B.1） ----------
section("B. 语言分池路由（routeEngines）");
const zhChain = routeEngines("深度学习 框架 对比", {});
assert(
  zhChain.slice(0, 4).join(",") === "bing,baidu,aliyun,anysearch",
  "中文查询 routeHead = 默认中文池 bing/baidu/aliyun/anysearch"
);
const enChain = routeEngines("deep learning framework comparison", {});
assert(
  enChain.slice(0, 3).join(",") === "bing,exa,tavily",
  "英文查询 routeHead = 默认英文池 bing/exa/tavily"
);
const customZh = routeEngines("中文问题", { zhPool: ["baidu", "anysearch", "ddg"] });
assert(
  customZh.slice(0, 3).join(",") === "baidu,anysearch,ddg",
  "配置 zhPool 覆盖默认中文池（顺序保留）"
);
const customEn = routeEngines("english question", { enPool: ["ddg", "searxng", "bing"] });
assert(
  customEn.slice(0, 3).join(",") === "ddg,searxng,bing",
  "配置 enPool 覆盖默认英文池（顺序保留）"
);
const junkPool = routeEngines("中文问题", { zhPool: ["baidu", "no-such-engine", "ddg"] });
assert(
  junkPool.slice(0, 2).join(",") === "baidu,ddg",
  "池配置中的未知引擎被过滤（不落入路由头）"
);
const disabledHead = routeEngines("中文问题", { disabledEngines: ["bing", "baidu"] });
assert(
  disabledHead.slice(0, 2).join(",") === "aliyun,anysearch",
  "禁用的池引擎从路由头剔除，其余池成员照常路由"
);
const timeChain = routeEngines("中文问题", { timeRange: true });
assert(
  timeChain.indexOf("baidu") < timeChain.indexOf("anysearch") && timeChain[0] === "baidu",
  "timeRange 时 TIME_ENGINES 池成员浮前（时间路由保留）"
);
// 显式-only 引擎（按次计费）永不入池：写进池配置也必须被过滤掉，否则全池并发会自动计费。
const billedPoolZh = routeEngines("中文问题", { zhPool: ["bing", "openai", "gemini", "claude"] });
assert(
  billedPoolZh.slice(0, 1).join(",") === "bing" && !["openai", "gemini", "claude"].includes(billedPoolZh[1]),
  "显式-only 引擎写进 zhPool 后被过滤（池头只剩 bing，openai/gemini/claude 不入池）"
);
const billedPoolEn = routeEngines("english question", { enPool: ["bing", "openai", "gemini", "claude"] });
assert(
  billedPoolEn.slice(0, 1).join(",") === "bing" && !["openai", "gemini", "claude"].includes(billedPoolEn[1]),
  "显式-only 引擎写进 enPool 后被过滤（英文侧同源）"
);

// ---------- C. Config 池字段（意见 B.1：zhPool/enPool 独立可编辑） ----------
section("C. Config 池字段");
const configFields = Config.dict ?? {};
assert(
  configFields.zhPool && configFields.zhPool.type === "array" && configFields.enPool && configFields.enPool.type === "array",
  "Config 声明 zhPool / enPool 两个独立数组字段"
);
assert(!("primaryPool" in configFields), "Config 不再声明 primaryPool（单池层已按评审拆掉）");
// #59 合入后 escalationEngines 由 registerResearchTool 注册进 Config，属预期演进（PR #59 评审 6016010103）。
assert(
  !("escalationEngines" in configFields) || configFields.escalationEngines,
  "escalationEngines：缺省=未注册（#58 基线），在则必为 research 注册的实字段（#59 之后）"
);

// ---------- D. 引擎清单完整性（回归钉子） ----------
section("D. 引擎清单");
assert(ALL_ENGINES.includes("zhihu_global") && ALL_ENGINES.includes("zhihu_site"), "知乎双引擎仍在 ALL_ENGINES（作为需 key 引擎）");
assert(routeEngines("", {}).length > 0, "空查询仍返回完整回退链（基本路径不因池化断链）");

// ---------- E. 知乎 URL 剥 utm（评审意见：去重键与展示不带脏尾巴） ----------
section("E. 知乎 URL 剥离");
assert(
  stripZhihuTracking("https://zhuanlan.zhihu.com/p/2088652596533896117?utm_medium=openapi_platform&utm_source=openapi") ===
    "https://zhuanlan.zhihu.com/p/2088652596533896117",
  "zhihuToSources 剥掉 utm_* 参数（保留业务查询参数与路径）"
);
assert(
  stripZhihuTracking("https://www.zhihu.com/question/1/answer/2?foo=bar&utm_source=x") ===
    "https://www.zhihu.com/question/1/answer/2?foo=bar",
  "只剥 utm_*，非营销参数原样保留"
);
assert(stripZhihuTracking("not a url") === "not a url", "非法 URL 原样返回（不抛异常）");

// ---------- H. Bing 不做「空 SERP 重试」（实测结论：重试只会加重限流） ----------
// 2026-10-13 实测：Bing 对可疑出口 IP 间歇返回约 91KB 空 SERP（b_algo=0）。曾加过「多试一次」
// 的兜底，但请求数翻倍后反而更容易被压死；根因在出口 IP（直连正常、走该代理为 0），不在解析。
// 因此这里反向钉住：searchBing 必须保持「单次抓取 + 单次解析」，不得重新引入重试循环。
section("H. Bing 不重试（防回退到加重限流的写法）");
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, "..", "lib", "index.js"), "utf8");
  const start = src.indexOf("async function searchBing(");
  const end = src.indexOf("//#region searxng");
  const body = start >= 0 && end > start ? src.slice(start, end) : "";
  assert(body.length > 0, "能定位 searchBing 函数体");
  assert(!/for\s*\(\s*let attempt = 1; attempt <= \d+; attempt\+\+\s*\)/.test(body),
    "searchBing 内没有重试循环（空 SERP 重试已实测为有害）");
  assert(/const html = await fetchHtmlWithRetry\(/.test(body), "仍走带重试的统一抓取（仅网络错/短响应时重试）");
}

// ---------- I. runEngineTest 的重试分支必须走统一收尾（防结果被静默丢弃） ----------
// 背景（2026-10-13 实测定位）：重试分支曾直接 `return await attempt()`，而大多数引擎的 attempt()
// 返回 `{ sources, truncated }`（没有 ok 字段）。调用方 `if (res.ok)` 遇 undefined 即当失败 ——
// 于是「首次空、重试成功」的引擎，结果被丢弃并报成 `[unknown] (unknown error)`（连错误信息都是空的）。
// exa / bing 都实测踩过。此断言钉住：重试路径与首次路径共用同一收尾，且不得再出现裸 return。
section("I. runEngineTest 重试分支收口");
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, "..", "lib", "index.js"), "utf8");
  const start = src.indexOf("const runEngineTest = async (");
  const end = src.indexOf("runMultiSearch = async (");
  const body = start >= 0 && end > start ? src.slice(start, end) : "";
  assert(body.length > 0, "能定位 runEngineTest 函数体");

  const code = body
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  const helperFree = code.replace(/const attemptWithKeyRotation = async \(\) => \{[\s\S]*?\n    \};/, "");
  assert(!/return await attempt\(\)/.test(helperFree), "代码里没有裸 `return await attempt()`（重试不得原样返回）");
  assert(/await attemptWithKeyRotation\(\)/.test(code), "首次与重试都经 attemptWithKeyRotation（#96 多 key 轮换）");
  assert(/const finalize = \(r\) => \(/.test(body), "存在统一收尾函数 finalize");
  assert(/return finalize\(result\)/.test(code), "首次成功路径走 finalize");
  assert(/return finalize\(retried\)/.test(code), "重试成功路径走 finalize（修复点）");
  assert(/if \(retried\.ok === false\) return retried;/.test(code), "重试若返回付费引擎的失败结果，仍如实透传");
}

// ---------- J. deepseek-tools（原生 /v1/tools/search）注册点齐全 ----------
// 背景（2026-10-17）：官方上线原生搜索 API——直接 POST /v1/tools/search 返回结构化 results[]，
// 无模型参与。同 query 下实测 ~0.3s vs 旧 Anthropic web_search 工具路径的 ~5-6s，且不耗 token。
// 新引擎最容易漏的是「声明点不全」：漏一处就会在某一入口上静默不可见或不可用，
// 因此这里把 6 个接入点逐一钉住。
section("J. deepseek-tools 注册点");
assert(ALL_ENGINES.includes("deepseek-tools"), "ALL_ENGINES 含 deepseek-tools（否则配置/UI/工具参数都会拒收）");
assert(
  DEFAULT_FALLBACK_ORDER.includes("deepseek-tools") && DEFAULT_FALLBACK_ORDER.indexOf("deepseek-tools") < DEFAULT_FALLBACK_ORDER.indexOf("deepseek-official"),
  "回退链含 deepseek-tools 且排在 deepseek-official 之前（同一把 key 下优先走快的那条）"
);
assert(TIME_ENGINES.includes("deepseek-tools"), "TIME_ENGINES 含 deepseek-tools（时间过滤走 query 的 after: 语法）");
assert(
  !!REQUIRED_CREDENTIALS["deepseek-tools"]?.some((r) => r.env === "DEEPSEEK_API_KEY" && r.settings === "deepseekApiKey"),
  "REQUIRED_CREDENTIALS 声明 DEEPSEEK_API_KEY（缺 key 时被合格性筛选跳过，而不是发起必然失败的请求）"
);
assert(!FREE_ENGINES.includes("deepseek-tools"), "deepseek-tools 需要 key，不得进入 FREE_ENGINES");
assert(!ALL_ENGINES.includes("deepseek-tool"), "没有拼写漂移的 deepseek-tool 残留");
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, "..", "lib", "index.js"), "utf8");
  // 两处分派必须都在：provider 主循环 + runEngineTest（缺后者则 free_search_test 测不到它）
  const dispatch = src.match(/engine === "deepseek-tools"/g) ?? [];
  assert(dispatch.length >= 1, "provider 主循环里有 deepseek-tools 分支");
  assert(/case "deepseek-tools":/.test(src), "runEngineTest 的 switch 里有 deepseek-tools 分支");
  const factory = src.indexOf("async function searchDeepSeekTools(");
  const end = src.indexOf("// SerpBase:", factory);
  const body = factory >= 0 && end > factory ? src.slice(factory, end) : "";
  assert(body.length > 0, "能定位 searchDeepSeekTools 函数体");
  assert(/\/v1\/tools\/search/.test(src), "走原生 /v1/tools/search 端点");
  assert(/summary/.test(body), "优先取 summary（600~800 字，面向模型）而非 snippet（100~200 字）");
  assert(!/tools\/fetch/.test(body), "搜索函数不掺 Fetch 端点");
  // 摘要上限：新引擎的 summary 若按默认 300 截断会被拦腰砍断
  const cap = src.indexOf("SNIPPET_MAX_BY_ENGINE");
  const capLine = src.slice(cap, src.indexOf("\n", src.indexOf("{", cap)));
  assert(/"deepseek-tools"\s*:\s*2000/.test(capLine), "SNIPPET_MAX_BY_ENGINE 为 deepseek-tools 放宽到 2000（否则 summary 被截半）");
}

console.log("");
if (failures.length === 0) {
  console.log(`OK: ${pass} assertions passed`);
} else {
  console.log(`FAILED: ${failures.length} of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
