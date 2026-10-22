// #92: search language vs output language, and localized tool text.
import assert from "node:assert/strict";

const { searchLanguage, outputLanguage, assessUncertainty } = await import("../lib/index.js");
const { wmoText, textLanguage } = await import("../lib/weather.js");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("searchLanguage passes supported languages through and falls back to en", () => {
  assert.equal(searchLanguage("zh"), "zh");
  assert.equal(searchLanguage("en"), "en");
  assert.equal(searchLanguage("ja"), "ja");
  assert.equal(searchLanguage("ru"), "ru");
  assert.equal(searchLanguage("ko"), "ko");
  assert.equal(searchLanguage("pt"), "en");
  assert.equal(searchLanguage(""), "en");
  assert.equal(searchLanguage(undefined), "en");
  assert.equal(searchLanguage(" JA "), "ja");
});

check("outputLanguage only ever returns zh or en", () => {
  assert.equal(outputLanguage("zh"), "zh");
  assert.equal(outputLanguage("en"), "en");
  assert.equal(outputLanguage("ja"), "en");
  assert.equal(outputLanguage("ru"), "en");
  assert.equal(outputLanguage("de"), "en");
  assert.equal(outputLanguage("nope"), "en");
});

check("weather text is English for ja and Chinese only for zh", () => {
  assert.equal(textLanguage("ja"), "en");
  assert.equal(wmoText(63, "ja"), "Moderate rain (WMO 63)");
  assert.equal(wmoText(63, "ru"), "Moderate rain (WMO 63)");
  assert.equal(wmoText(63, "en"), "Moderate rain (WMO 63)");
  assert.equal(wmoText(63, "zh"), "中雨 (WMO 63)");
  assert.equal(wmoText(999, "ja"), "Unknown");
  assert.equal(wmoText(999, "zh"), "未知");
});

check("uncertainty notes follow the output language", () => {
  const zh = assessUncertainty({ sources: [], lang: "zh" });
  assert.equal(zh.level, "low");
  assert.ok(zh.notes.some((note) => /没有返回结果/.test(note)), zh.notes.join("|"));

  const ja = assessUncertainty({ sources: [], lang: "ja" });
  assert.ok(ja.notes.some((note) => /no results returned/.test(note)), ja.notes.join("|"));
  assert.ok(ja.notes.every((note) => !/[\u4e00-\u9fa5]/.test(note)), ja.notes.join("|"));

  const en = assessUncertainty({ sources: [], lang: "en" });
  assert.ok(en.notes.some((note) => /no results returned/.test(note)));
});

check("a failure note is reported in the output language", () => {
  const sources = [
    { url: "https://a.example/1" },
    { url: "https://b.example/2" },
    { url: "https://c.example/3" },
  ];
  const ja = assessUncertainty({ sources, note: "bing failed, using ddg", lang: "ja" });
  assert.equal(ja.level, "low");
  assert.ok(ja.notes.every((note) => !/[\u4e00-\u9fa5]/.test(note)), ja.notes.join("|"));

  const zh = assessUncertainty({ sources, note: "bing failed, using ddg", lang: "zh" });
  assert.ok(zh.notes.some((note) => /不完整/.test(note)));
});

console.log(`OK: ${checks} output-language checks passed`);
