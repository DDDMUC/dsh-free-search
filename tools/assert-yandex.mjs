// Yandex Search API (official, paid): XML-in-Base64 results.
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  searchYandex,
  parseYandexXml,
  yandexPeriod,
  normalizeYandexSearchType,
  YANDEX_SEARCH_TYPES,
} from "../lib/engines/yandex.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const realFetch = globalThis.fetch;
const XML = `<?xml version="1.0" encoding="utf-8"?>
<yandexsearch version="1.0"><response><results><grouping>
<group><doc>
<url>https://a.test/1</url>
<title><![CDATA[Заголовок <hlword>один</hlword>]]></title>
<passages><passage>Первый &amp; текст</passage><passage>Второй</passage></passages>
<modtime>20261101T120000</modtime>
</doc></group>
<group><doc><url>https://b.test/2</url><title>B</title><passages><passage>snippet b</passage></passages></doc></group>
<group><doc><url>https://a.test/1</url><title>dup</title></doc></group>
</grouping></results></response></yandexsearch>`;

await check("the API key and folder are both required", async () => {
  await assert.rejects(() => searchYandex("q", 5, "", "folder"), /YANDEX_API_KEY/);
  await assert.rejects(() => searchYandex("q", 5, "key", ""), /folder ID/);
});

await check("the request carries a bearer key, folder, type, group and period", async () => {
  let captured = null;
  let headers = null;
  let body = null;
  globalThis.fetch = async (url, init) => {
    captured = String(url);
    headers = init.headers;
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ rawData: Buffer.from(XML).toString("base64") }) };
  };
  try {
    const result = await searchYandex("кофе", 5, "y-key", "folder-1", { searchType: "auto", lang: "ru", safeSearch: "strict" }, { days: 7 });
    assert.equal(captured, "https://searchapi.api.cloud.yandex.net/v2/web/search");
    assert.equal(headers.authorization, "Api-Key y-key");
    assert.equal(body.query.queryText, "кофе");
    assert.equal(body.query.searchType, "SEARCH_TYPE_RU");
    assert.equal(body.query.familyMode, "FAMILY_MODE_STRICT");
    assert.equal(body.folderId, "folder-1");
    assert.equal(body.responseFormat, "FORMAT_XML");
    assert.equal(body.groupSpec.groupMode, "GROUP_MODE_FLAT");
    assert.equal(body.groupSpec.groupsOnPage, "5");
    assert.equal(body.groupSpec.docsInGroup, "1");
    assert.equal(body.period, "PERIOD_2_WEEKS");
    assert.equal(result.sources.length, 2);
    assert.equal(result.sources[0].title, "Заголовок один");
    assert.equal(result.sources[0].snippet, "Первый & текст Второй");
    assert.equal(result.sources[0].publishedAt, "2026-11-01");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("search type, period and family mapping", () => {
  assert.equal(normalizeYandexSearchType("auto", "ru"), "SEARCH_TYPE_RU");
  assert.equal(normalizeYandexSearchType("auto", "tr"), "SEARCH_TYPE_TR");
  assert.equal(normalizeYandexSearchType("auto", "en"), "SEARCH_TYPE_COM");
  assert.equal(normalizeYandexSearchType("kk", "en"), "SEARCH_TYPE_KK");
  assert.equal(normalizeYandexSearchType("bogus", "be"), "SEARCH_TYPE_BE");
  assert.deepEqual(YANDEX_SEARCH_TYPES, ["auto", "ru", "tr", "com", "kk", "be", "uz"]);
  assert.equal(yandexPeriod({ days: 1 }), "PERIOD_DAY");
  assert.equal(yandexPeriod({ days: 14 }), "PERIOD_2_WEEKS");
  assert.equal(yandexPeriod({ days: 30 }), "PERIOD_MONTH");
  assert.equal(yandexPeriod({ days: 365 }), undefined);
  assert.equal(yandexPeriod(undefined), undefined);
});

await check("XML parsing maps docs and leaves duplicate URLs to the shared deduper", () => {
  const sources = parseYandexXml(XML);
  assert.equal(sources.length, 3);
  const unique = new Set(sources.map((source) => source.url));
  assert.equal(unique.size, 2);
});

await check("upstream errors and malformed payloads name the failure", async () => {
  const cases = [
    [401, /API key or folder is invalid/],
    [403, /API key or folder is invalid/],
    [429, /quota/],
    [400, /check yandexFolderId/],
  ];
  for (const [status, pattern] of cases) {
    globalThis.fetch = async () => ({ ok: false, status, text: async () => '{"message":"upstream detail"}' });
    await assert.rejects(() => searchYandex("q", 3, "k", "folder"), pattern);
  }
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(() => searchYandex("q", 3, "k", "folder"), /no rawData/);
  globalThis.fetch = realFetch;
});

await check("the engine is registered everywhere and stays explicit-only", async () => {
  const meta = await import("../lib/engine_meta.js");
  assert.equal(meta.ALL_ENGINES.length, 38);
  assert.equal(meta.ALL_ENGINES.includes("yandex"), true);
  assert.equal(meta.TIME_ENGINES.includes("yandex"), false);
  assert.equal(meta.DEFAULT_FALLBACK_ORDER.includes("yandex"), false);
  assert.equal(meta.EXPLICIT_ONLY_ENGINES.includes("yandex"), true);
  const { REQUIRED_CREDENTIALS } = await import("../lib/multi_policy.js");
  assert.equal(REQUIRED_CREDENTIALS.yandex?.[0]?.env, "YANDEX_API_KEY");
  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(index, /yandex: async \(/);
  assert.match(index, /case "yandex":/);
  assert.match(index, /yandexFolderId: z\.string\(\)\.default\(""\)/);
  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /id: "yandex"/);
  assert.match(client, /yandexSearchTypeLabel/);
  assert.match(client, /path: \["yandexFolderId"\]/);
});

console.log(`OK: ${checks} yandex checks passed`);
