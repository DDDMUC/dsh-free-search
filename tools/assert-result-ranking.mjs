// #69 §4 断言：合并后的排序信号（域名多样性 / 原始顺序 / seenIn 降级 / 时效性）
//
// reporter 原文要求：
//   - "Ranking should use the signals that are actually available and meaningful:
//      original result order, ... domain diversity, and freshness when freshness matters."
//   - "seenIn should remain useful provenance and corroboration metadata, not proof
//      that a result is correct." → 它不许当主排序键
//   - "Six matching search results do not necessarily constitute six independent
//      sources." → 同域堆叠要被打散
//
// 现状（改造前）是 `b.seenInSet.size - a.seenInSet.size` 当第一排序键，本文件钉住新语义。
import { rankMergedResults, domainOf } from "../lib/multi_policy.js";

let passed = 0;
const failures = [];
const check = (name, cond) => {
  if (cond) { passed++; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name); }
};

// 构造条目：i=原始顺序，c=佐证引擎数，d=域名
const mk = (i, d, c = 1, publishedAt = null) => ({ i, domain: d, order: i, corroboration: c, publishedAt });
const idx = (out) => out.map((x) => x.i).join(",");

// ---------- A. domainOf（eTLD+1） ----------
check("domainOf 取可注册域（子域归并）", domainOf("https://blog.csdn.net/a/b?x=1") === "csdn.net");
check("domainOf 去 www.", domainOf("https://www.example.com/x") === "example.com");
check("domainOf 小写化", domainOf("https://EXAMPLE.com/X") === "example.com");
check("domainOf 保留端口外的路径无关性", domainOf("https://a.com:8443/x") === "a.com");
check("domainOf 非法 URL 不抛", typeof domainOf("not a url") === "string");
check("domainOf 空值不抛", domainOf("") === "");
// eTLD+1 的核心收益：同一站点的不同子域必须归一（旧行为会当成两个独立来源）
check("eTLD+1：blog/download 归为同域", domainOf("https://blog.example.com/x") === domainOf("https://download.example.com/y"));
check("eTLD+1：多段后缀 co.uk 保留三段", domainOf("https://a.foo.co.uk/x") === "foo.co.uk");
check("eTLD+1：多段后缀 com.cn 保留三段", domainOf("https://news.sina.com.cn/x") === "sina.com.cn");
check("eTLD+1：深度子域只取可注册域", domainOf("https://a.b.c.example.com/x") === "example.com");
check("eTLD+1：IPv4 原样", domainOf("https://192.168.1.1/x") === "192.168.1.1");
check("eTLD+1：localhost 原样", domainOf("http://localhost:3000/x") === "localhost");

// ---------- B. seenIn 不再是主排序键 ----------
// 场景：条目 0（order 最小、域 d1）只有 1 个引擎；条目 5（order 更大）被 3 个引擎返回。
// 旧实现会把条目 5 排最前；新语义要求按域轮转，order 小的先出。
{
  const out = rankMergedResults([mk(0, "d1.com", 1), mk(5, "d2.com", 3)]);
  check("seenIn 高者不再无条件置顶（按域轮转 + 原始顺序）", idx(out) === "0,5");
}
check("佐证数仅作末位 tiebreak（order 相同时才生效）",
  idx(rankMergedResults([{ i: 1, domain: "d1.com", order: 9, corroboration: 1 }, { i: 2, domain: "d2.com", order: 9, corroboration: 5 }])) === "2,1");

// ---------- C. 域名多样性：轮转交错 ----------
{
  const out = rankMergedResults([
    mk(0, "a.com"), mk(1, "a.com"), mk(2, "a.com"),
    mk(3, "b.com"), mk(4, "b.com"),
    mk(5, "c.com"),
  ]);
  check("三域轮转：a,b,c,a,b,a", idx(out) === "0,3,5,1,4,2");
}
{
  const out = rankMergedResults([mk(0, "a.com"), mk(1, "a.com"), mk(2, "a.com"), mk(3, "a.com")]);
  check("单域不被打散（保持内部次序）", idx(out) === "0,1,2,3");
}
{
  const out = rankMergedResults([mk(7, "x.com"), mk(2, "y.com")]);
  check("域顺序按各域最佳条目的原始顺序（y 先于 x）", idx(out) === "2,7");
}

// ---------- D. 不丢弃任何条目（多样性只重排） ----------
{
  const input = [mk(0, "a.com"), mk(1, "a.com"), mk(2, "b.com"), mk(3, "c.com"), mk(4, "a.com")];
  const out = rankMergedResults(input);
  check("条目数不变（只重排不剔除）", out.length === input.length);
  check("输出集合与输入一致", [...new Set(out.map((x) => x.i))].sort((a, b) => a - b).join(",") === "0,1,2,3,4");
}

// ---------- E. 时效性：仅在 appliesFreshness 时参与 ----------
const t = (s) => new Date(s).toISOString();
{
  const items = [mk(0, "a.com", 1, t("2026-01-01")), mk(1, "a.com", 1, t("2026-09-01"))];
  check("开启时效性：同域内新的优先", idx(rankMergedResults(items, { appliesFreshness: true })) === "1,0");
  check("未开时效性：按原始顺序（发布时间忽略）", idx(rankMergedResults(items, { appliesFreshness: false })) === "0,1");
  check("默认（不传选项）等同未开", idx(rankMergedResults(items)) === "0,1");
}
{
  const items = [mk(0, "a.com", 1, null), mk(1, "a.com", 1, t("2026-09-01"))];
  check("缺发布时间的条目视为最旧（时效开启时排后）", idx(rankMergedResults(items, { appliesFreshness: true })) === "1,0");
  check("非法发布时间不抛且视为最旧",
    idx(rankMergedResults([mk(0, "a.com", 1, "not-a-date"), mk(1, "a.com", 1, t("2026-09-01"))], { appliesFreshness: true })) === "1,0");
}

// ---------- F. 边界与健壮 ----------
check("空输入 → 空输出", rankMergedResults([]).length === 0);
check("非数组输入不抛", rankMergedResults(undefined).length === 0);
check("单条 → 原样", idx(rankMergedResults([mk(3, "a.com")])) === "3");
check("缺 domain 的条目归入同一组且不抛",
  rankMergedResults([{ i: 0, order: 0, corroboration: 1 }, { i: 1, order: 1, corroboration: 1 }]).length === 2);
check("不改动入参数组顺序（纯函数）",
  (() => { const a = [mk(2, "b.com"), mk(1, "a.com")]; const before = a.map((x) => x.i).join(","); rankMergedResults(a); return a.map((x) => x.i).join(",") === before; })());

// ---------- G. 与 reporter 场景对齐：六条同域不该占满前列 ----------
{
  // 6 条同域 + 3 条异域 → 前 3 条里应出现 3 个不同域名
  const out = rankMergedResults([
    mk(0, "farm.com"), mk(1, "farm.com"), mk(2, "farm.com"),
    mk(3, "farm.com"), mk(4, "farm.com"), mk(5, "farm.com"),
    mk(6, "good.com"), mk(7, "other.com"), mk(8, "third.com"),
  ]);
  const head3 = out.slice(0, 3).map((x) => x.domain);
  check("同域堆叠被打散：前 3 条来自 3 个不同域", new Set(head3).size === 3);
  check("farm.com 的 6 条仍全部保留", out.filter((x) => x.domain === "farm.com").length === 6);
}

console.log("");
if (failures.length === 0) console.log(`OK: ${passed} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
