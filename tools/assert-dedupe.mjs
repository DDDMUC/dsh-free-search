// Near-duplicate merged results: syndicated copies differ by URL only.
import assert from "node:assert/strict";
import fs from "node:fs";
import { dedupeNearDuplicates, minHash, similarity } from "../lib/dedupe.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const article = {
  title: "DeepSeek Harness plugin guide",
  snippet: "How to install a plugin, configure it and restart the web host safely.",
};
const syndicated = {
  title: "DeepSeek Harness plugin guide (mirror)",
  snippet: "How to install a plugin, configure it and restart the web host safely. Read more.",
};

check("identical text gets the same MinHash signature", () => {
  assert.equal(similarity(minHash(article.title + article.snippet), minHash(article.title + article.snippet)), 1);
});

check("an exact URL duplicate is dropped", () => {
  const sources = [
    { url: "https://a.test/1", ...article },
    { url: "https://a.test/1", ...article },
  ];
  assert.equal(dedupeNearDuplicates(sources).length, 1);
});

check("a syndicated copy under another URL is dropped", () => {
  const sources = [
    { url: "https://a.test/1", ...article },
    { url: "https://mirror.test/copy", ...syndicated },
  ];
  assert.equal(dedupeNearDuplicates(sources).length, 1);
});

check("different articles survive and order is preserved", () => {
  const sources = [
    { url: "https://a.test/1", ...article },
    { url: "https://b.test/2", title: "Completely different", snippet: "Another topic that shares no wording with the first one." },
    { url: "https://c.test/3", ...article },
  ];
  const kept = dedupeNearDuplicates(sources);
  assert.deepEqual(kept.map((source) => source.url), ["https://a.test/1", "https://b.test/2"]);
});

check("the threshold is configurable", () => {
  const sources = [
    { url: "https://a.test/1", ...article },
    { url: "https://b.test/2", title: "DeepSeek Harness plugin", snippet: "install a plugin and restart the host" },
  ];
  assert.equal(dedupeNearDuplicates(sources, { threshold: 0.2 }).length, 1);
  assert.equal(dedupeNearDuplicates(sources, { threshold: 0.99 }).length, 2);
});

check("the provider and multi paths both run the dedupe", () => {
  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(index, /dedupeNearDuplicates\(safe\.sources\)/);
  assert.match(index, /sources: dedupeNearDuplicates\(sanitizeSources\(finalSources\)\)/);
});

console.log(`OK: ${checks} dedupe checks passed`);
