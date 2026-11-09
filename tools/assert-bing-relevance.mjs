// #112: Bing sometimes answers with an unrelated substituted SERP. The old
// single-character token test let any page containing 年/月 pass.
import assert from "node:assert/strict";
import { looksRelevant, queryOverlapTokens } from "../lib/engines/bing.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const source = (title, snippet = "", url = "https://example.com/") => ({ title, snippet, url });

check("single-character CJK tokens are gone", () => {
  const tokens = queryOverlapTokens("2026年10月LPR 一年期 五年期 报价");
  assert.equal(tokens.includes("年"), false);
  assert.equal(tokens.includes("月"), false);
  for (const token of ["lpr", "一年", "五年", "报价"]) assert.equal(tokens.includes(token), true, token);
});

check("an unrelated Bing SERP is rejected", () => {
  const sources = [
    source("百度百科：2026年节假日日历"),
    source("2026 年放假安排 - gov.cn"),
    source("2026 年前三季度经济数据"),
    source("历年股利政策一览（年/月）"),
    source("163 邮箱登录入口"),
    source("00964 中国信託亞太高股息 ETF"),
  ];
  assert.equal(looksRelevant("2026年10月LPR 一年期 五年期 报价", sources), false);
});

check("a genuinely relevant SERP passes", () => {
  const sources = Array.from({ length: 10 }, (_, i) =>
    source(`2026年10月 LPR 报价利率公布 ${i}`, "贷款市场报价利率（LPR）一年期与五年期报价")
  );
  assert.equal(looksRelevant("2026年10月LPR 一年期 五年期 报价", sources), true);
});

check("a batch matching only a generic engine name is rejected", () => {
  const sources = Array.from({ length: 10 }, (_, i) => source(`PowerShell 文档 ${i}`, "PowerShell 教程"));
  assert.equal(looksRelevant("PowerShell Get-Content UTF-8 中文乱码 BOM", sources), false);
});

check("one distinctive token covering half the query still passes", () => {
  const sources = Array.from({ length: 3 }, (_, i) => source(`Docker guide ${i}`));
  assert.equal(looksRelevant("docker documentation", sources), true);
});

check("single-character and numeric-only queries keep their explicit behaviour", () => {
  assert.equal(looksRelevant("猫", [source("完全无关")]), true);
  assert.equal(looksRelevant("2026", [source("2026 年日历")]), true);
  assert.equal(looksRelevant("2026", [source("163 邮箱")]), false);
});

console.log(`OK: ${checks} bing-relevance checks passed`);
