// Small output contract: meta.uncertainty on advanced_search / multi_search.
import assert from "node:assert/strict";

const { assessUncertainty } = await import("../lib/index.js");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const s = (url, extra = {}) => ({ url, title: "t", ...extra });

check("no results is low", () => {
  const u = assessUncertainty({ sources: [] });
  assert.equal(u.level, "low");
  assert.ok(u.notes.length > 0);
});

check("a single source is low", () => {
  assert.equal(assessUncertainty({ sources: [s("https://a.example/x")] }).level, "low");
});

check("two sources are medium", () => {
  assert.equal(
    assessUncertainty({ sources: [s("https://a.example/x"), s("https://b.example/y")] }).level,
    "medium"
  );
});

check("three distinct domains are high with no caveats", () => {
  const u = assessUncertainty({
    sources: [s("https://a.example/1"), s("https://b.example/2"), s("https://c.example/3")],
  });
  assert.equal(u.level, "high");
  assert.deepEqual(u.notes, []);
});

check("all results from one site is medium", () => {
  const u = assessUncertainty({
    sources: [s("https://a.example/1"), s("https://www.a.example/2"), s("https://a.example/3")],
  });
  assert.equal(u.level, "medium");
  assert.ok(u.notes.some((n) => n.includes("同一站点")));
});

check("a time filter without dates lowers confidence", () => {
  const u = assessUncertainty({
    sources: [s("https://a.example/1"), s("https://b.example/2"), s("https://c.example/3")],
    timeRange: true,
  });
  assert.equal(u.level, "medium");
  assert.ok(u.notes.some((n) => n.includes("没有发布时间")));
});

check("a failure note marks the result incomplete", () => {
  const u = assessUncertainty({
    sources: [s("https://a.example/1"), s("https://b.example/2"), s("https://c.example/3")],
    note: "bing failed, using ddg",
  });
  assert.equal(u.level, "low");
  assert.ok(u.notes.some((n) => n.includes("不完整")));
});

check("aggregator domains add a caveat", () => {
  const u = assessUncertainty({
    sources: [s("https://zhuanlan.zhihu.com/p/1"), s("https://www.zhihu.com/question/2"), s("https://c.example/3")],
  });
  assert.ok(u.notes.some((n) => n.includes("聚合站")));
});

console.log(`OK: ${checks} uncertainty checks passed`);
