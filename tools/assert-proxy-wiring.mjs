// #155 回归：代理配置必须在所有入口都生效，尤其是绕过 searchOnce 的那几个
// （free_search_test、multi_search、设置页「测试引擎」，都走 runEngineTest）。
//
// 报告里的现象：冷进程下测试路径全红，先搜一次就全绿——因为活动值只有
// searchOnce 写。这里用三组断言钉住：
//   1. runEngineTest 自己写活动值
//   2. 即使没有任何入口写，统一出口也会现读配置（resolver 兜底）
//   3. 测试路径与真实搜索路径拿到同一个代理
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  setActiveSearchProxy,
  setSearchProxyResolver,
  getActiveSearchProxy,
  proxyFetch,
} from "../lib/proxy_fetch.js";

const root = new URL("..", import.meta.url);
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("every entry point that bypasses searchOnce sets the active proxy", () => {
  // runEngineTest 被 free_search_test / multi_search / 设置页 bridge 共用。
  const fn = index.slice(index.indexOf("const runEngineTest = async"), index.indexOf("const attempt = async"));
  assert.match(fn, /setActiveBlockedDomains\(cfg\.blockedDomains\)/, "the #72 choke point is there");
  assert.match(fn, /setActiveSearchProxy\(cfg\.searchProxy\)/, "the proxy must be set here too");
});

check("runMultiSearch sets it as well", () => {
  const fn = index.slice(index.indexOf("runMultiSearch = async"), index.indexOf("const q = String(query).trim()"));
  assert.match(fn, /setActiveSearchProxy\(/, "multi_search has its own choke point");
});

check("the plugin registers a live-config fallback for the proxy", () => {
  // 光靠各入口记得写是不够的——这已经是第二次栽在同一个坑（#72 是第一次）。
  // 统一出口因此再挂一个 resolver：活动值空着时现读配置。
  assert.match(index, /setSearchProxyResolver\(\(\) => current\(\)\.searchProxy\)/);
  assert.match(index, /setSearchProxyResolver\(null\)/, "the resolver must be released with the plugin");
});

check("a forgotten write no longer falls back to a direct connection", () => {
  // 模拟冷进程：没有任何入口写过活动值，但配置里有代理。
  setActiveSearchProxy("");
  let configured = "socks5://10.113.75.123:1080";
  setSearchProxyResolver(() => configured);
  assert.equal(getActiveSearchProxy(), configured, "the resolver must supply the configured value");

  // 活动值一旦被写入，仍然优先于 resolver（入口级覆盖依然有效）。
  setActiveSearchProxy("http://127.0.0.1:7890");
  assert.equal(getActiveSearchProxy(), "http://127.0.0.1:7890");

  setActiveSearchProxy("");
  configured = "";
  assert.equal(getActiveSearchProxy(), "", "an empty setting still means direct");
  setSearchProxyResolver(null);
});

check("a broken resolver does not break the request path", () => {
  setSearchProxyResolver(() => {
    throw new Error("config service went away");
  });
  assert.equal(getActiveSearchProxy(), "", "a throwing resolver degrades to direct, not a crash");
  setSearchProxyResolver(null);
});

check("proxyFetch honours the resolver when no entry wrote anything", async () => {
  // 用一个不可达的代理：如果 resolver 生效，请求立刻失败；如果被忽略，
  // 它会走平台 fetch 去 example.com（联网测试不允许，所以只验解析结果）。
  setActiveSearchProxy("");
  setSearchProxyResolver(() => "http://127.0.0.1:1");
  const failures = await proxyFetch("https://example.invalid/", { timeoutMs: 800 }).then(
    () => "reached",
    (error) => `blocked: ${error?.message ?? error}`
  );
  assert.match(failures, /blocked/, "a configured proxy must not be silently ignored");
  assert.match(failures, /ECONNREFUSED|timed out|127\.0\.0\.1/, "the failure must come from the proxy");
  setSearchProxyResolver(null);
});

check("the history that motivated the fallback is recorded", () => {
  // #72 修过一次同构问题，这是第二次；注释要说明白，否则下一个人会再删掉它。
  assert.match(index, /#155（回归）/);
  assert.match(index, /假阳性/);
});

console.log(`OK: ${checks} proxy-wiring regression checks passed`);
