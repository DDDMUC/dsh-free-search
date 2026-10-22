// #92: search language vs output language, and localized tool text.
import assert from "node:assert/strict";

const { searchLanguage, outputLanguage, configLanguage, acceptLanguageFor, assessUncertainty } = await import("../lib/index.js");
const { browserishHeaders } = await import("../lib/fetch_provider.js");
const { wmoText, textLanguage, formatWeather } = await import("../lib/weather.js");

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

check("weather text has zh / en / ja and falls back to English otherwise", () => {
  assert.equal(textLanguage("ja"), "ja");
  assert.equal(textLanguage(" JA "), "ja");
  assert.equal(textLanguage("ru"), "en");
  assert.equal(textLanguage(undefined), "en");
  assert.equal(wmoText(63, "ja"), "雨 (WMO 63)");
  assert.equal(wmoText(63, "ru"), "Moderate rain (WMO 63)");
  assert.equal(wmoText(63, "en"), "Moderate rain (WMO 63)");
  assert.equal(wmoText(63, "zh"), "中雨 (WMO 63)");
  assert.equal(wmoText(999, "ja"), "不明");
  assert.equal(wmoText(999, "ru"), "Unknown");
  assert.equal(wmoText(999, "zh"), "未知");
});

check("every WMO code has a Japanese description", () => {
  for (const code of [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]) {
    const ja = wmoText(code, "ja");
    assert.match(ja, new RegExp(` \\(WMO ${code}\\)$`), ja);
    assert.notEqual(ja, wmoText(code, "en"), ja);
    assert.notEqual(ja, wmoText(code, "zh"), ja);
  }
});

check("the weather body follows the text language", () => {
  // location 取 Open-Meteo geocoding 对「Tokyo」实际返回的值（name, admin1, country）
  const locations = { ja: "東京都, 東京都, 日本", en: "Tokyo, Tokyo, Japan", zh: "東京, 东京都, 日本", ru: "Токио, Токио, Япония" };
  const value = (lang) => ({
    location: locations[lang],
    current: { temperature: 21.4, apparent: 19.9, humidity: 45, wind: 7.8, text: wmoText(1, lang) },
    daily: [
      { date: "2026-10-24", min: 13.6, max: 15.7, text: wmoText(63, lang), precipitationProbability: 94 },
      { date: "2026-10-25", min: 12, max: 18, text: wmoText(3, lang) },
    ],
  });
  assert.equal(
    formatWeather(value("ja"), "ja"),
    [
      "東京都, 東京都, 日本 の天気：",
      "現在：21.4°C（体感 19.9°C）、晴れ (WMO 1)、湿度 45%、風速 7.8 km/h",
      "2026-10-24：13.6〜15.7°C、雨 (WMO 63)、降水確率 94%",
      "2026-10-25：12〜18°C、曇り (WMO 3)",
    ].join("\n")
  );
  // zh / en 与改动前的 render 逐字一致
  assert.equal(
    formatWeather(value("en"), "en"),
    [
      "Weather for Tokyo, Tokyo, Japan:",
      "Now: 21.4°C (feels 19.9°C), Mainly clear (WMO 1), humidity 45%, wind 7.8 km/h",
      "2026-10-24: 13.6~15.7°C, Moderate rain (WMO 63), precip 94%",
      "2026-10-25: 12~18°C, Overcast (WMO 3)",
    ].join("\n")
  );
  assert.equal(
    formatWeather(value("zh"), "zh"),
    [
      "東京, 东京都, 日本 天气：",
      "当前：21.4°C（体感 19.9°C），大部晴朗 (WMO 1)，湿度 45%，风速 7.8 km/h",
      "2026-10-24：13.6~15.7°C，中雨 (WMO 63)，降水概率 94%",
      "2026-10-25：12~18°C，阴 (WMO 3)",
    ].join("\n")
  );
  assert.ok(formatWeather(value("ru"), "ru").startsWith("Weather for "));
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

check("an unset lang keeps the schema default (zh), while an unsupported value falls back to en", () => {
  assert.equal(configLanguage({}), "zh");
  assert.equal(configLanguage({ lang: "" }), "zh");
  assert.equal(configLanguage({ lang: "  " }), "zh");
  assert.equal(configLanguage({ lang: "ja" }), "ja");
  assert.equal(configLanguage({ lang: "JA" }), "ja");
  assert.equal(configLanguage({ lang: "pt" }), "pt");
});

check("Accept-Language follows lang, bingMarket wins, unknown falls back to en", () => {
  assert.equal(acceptLanguageFor({}), "zh-CN,zh;q=0.9,en;q=0.8");
  assert.equal(acceptLanguageFor({ lang: "ja" }), "ja-JP,ja;q=0.9,en;q=0.8");
  assert.equal(acceptLanguageFor({ lang: "pt" }), "en-US,en;q=0.9");
  assert.equal(acceptLanguageFor({ bingMarket: "ja-JP" }), "ja-JP,ja;q=0.9,en;q=0.8");
  assert.equal(acceptLanguageFor({ lang: "ja", bingMarket: "zh-CN" }), "zh-CN,zh;q=0.9,en;q=0.8");
});

check("the fetch provider sends the language it is given (and a sane default)", () => {
  assert.equal(browserishHeaders("ja-JP,ja;q=0.9,en;q=0.8")["Accept-Language"], "ja-JP,ja;q=0.9,en;q=0.8");
  assert.equal(browserishHeaders()["Accept-Language"], "en-US,en;q=0.9");
  assert.equal(browserishHeaders("  ")["Accept-Language"], "en-US,en;q=0.9");
  assert.match(browserishHeaders("ja-JP")["User-Agent"], /Mozilla/);
});
console.log(`OK: ${checks} output-language checks passed`);
