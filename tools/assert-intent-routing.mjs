// Lightweight intent routing: reorder the already-selected language pool only.
import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyIntent, preferForIntent } from "../lib/intent.js";
import { routeEngines } from "../lib/index.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("queries classify into the five domains and general", () => {
  assert.equal(classifyIntent("2026年10月 LPR 利率报价").domain, "finance");
  assert.equal(classifyIntent("recent arxiv paper on retrieval").domain, "academic");
  assert.equal(classifyIntent("python asyncio timeout error").domain, "code");
  assert.equal(classifyIntent("今天有什么新闻").domain, "news");
  assert.equal(classifyIntent("机械键盘 哪款 性价比").domain, "shopping");
  assert.equal(classifyIntent("deepseek harness").domain, "general");
});

check("preference reordering is stable and ignores unknown ids", () => {
  assert.deepEqual(preferForIntent(["bing", "baidu", "aliyun"], { domain: "finance" }), ["baidu", "bing", "aliyun"]);
  assert.deepEqual(preferForIntent(["bing", "exa", "tavily"], { domain: "academic" }), ["exa", "tavily", "bing"]);
  assert.deepEqual(preferForIntent(["bing", "baidu"], { domain: "general" }), ["bing", "baidu"]);
});

check("auto routing prefers the domain head", () => {
  const finance = routeEngines("2026年10月 LPR 利率报价", {});
  assert.equal(finance[0], "baidu");
  const academic = routeEngines("arxiv paper retrieval", {});
  assert.equal(academic[0], "exa");
  const general = routeEngines("deepseek harness", {});
  assert.equal(general[0], "bing");
});

check("a custom fallback order is never reordered by intent", () => {
  const order = ["exa", "tavily", "bing"];
  const routed = routeEngines("LPR interest rate", { fallbackOrder: order });
  assert.equal(routed[0], "exa");
});

check("time filtering still floats time-capable engines after intent reordering", () => {
  const routed = routeEngines("今天 LPR 利率新闻", { timeRange: true });
  assert.equal(routed[0], "baidu");
});

check("intent and dedupe are wired in index", () => {
  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(index, /preferForIntent\(head, classifyIntent\(query\)\)/);
});

console.log(`OK: ${checks} intent-routing checks passed`);
