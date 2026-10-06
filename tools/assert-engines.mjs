// #58 评审意见 E 的可复现断言：语言分池路由 / 池配置 / FREE_ENGINES 口径。
// 纯函数断言，不需要 key、不发起网络请求、不依赖测试框架。
// 运行（Node >= 20，需要能解析 @deepseek-ai/{schemastery,dsh-tools,dsh-settings}，
// git clone 后 `npm install` 即满足；在 DSH 安装目录的插件包内也可直接跑）：
//   node tools/assert-engines.mjs
// 全部通过输出 `OK: N assertions passed` 并以 0 退出；任何失败以 1 退出并列出失败项。

import { FREE_ENGINES, ALL_ENGINES, routeEngines, Config, stripZhihuTracking } from "../lib/index.js";

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
  FREE_ENGINES.join(",") === "ddg,ddg-lite,bing,searxng,anysearch",
  "FREE_ENGINES = 5 个免 key 引擎（zhihu_* 需要 ZHIHU_API_KEY，不得进入）"
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
assert(!("escalationEngines" in configFields), "escalationEngines 已移出本 PR（#59 research 补搜轮自带）");

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

console.log("");
if (failures.length === 0) {
  console.log(`OK: ${pass} assertions passed`);
} else {
  console.log(`FAILED: ${failures.length} of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
