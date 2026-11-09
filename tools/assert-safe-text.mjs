// #108: a UTF-16 slice through a surrogate pair leaves a lone surrogate. Stored
// in session history it makes the upstream endpoint reject every later request,
// so text leaving the plugin must never contain one.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const {
  stripLoneSurrogates,
  sliceByCodePoint,
  truncateText,
  sanitizeSource,
  sanitizeSources,
  sanitizeSearchResult,
  sanitizeError,
} = await import(new URL("lib/safe_text.js", root));
const { cleanSnippet } = await import(new URL("lib/index.js", root));

const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const shared = fs.readFileSync(new URL("lib/engines/shared.js", root), "utf8");
const serp = fs.readFileSync(new URL("lib/serp_engines.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("stray high and low surrogates become U+FFFD, valid pairs survive", () => {
  assert.equal(stripLoneSurrogates("a\uD83Db"), "a\uFFFDb");
  assert.equal(stripLoneSurrogates("a\uDE00b"), "a\uFFFDb");
  assert.equal(stripLoneSurrogates("a\uD83D\uDE00b"), "a\uD83D\uDE00b");
  assert.equal(stripLoneSurrogates("\uDE00\uD83D"), "\uFFFD\uFFFD");
  assert.equal(stripLoneSurrogates(42), 42);
  assert.equal(stripLoneSurrogates(""), "");
});

check("code-point slicing never splits a pair", () => {
  const text = "a".repeat(299) + "\u{1F600}" + "b".repeat(10);
  const cut = sliceByCodePoint(text, 300);
  assert.equal(LONE.test(cut), false);
  assert.equal(Array.from(cut).length, 300);
  assert.equal(cut.endsWith("\u{1F600}"), true);
});

check("a cut right at an emoji keeps 300 units and no half pair", () => {
  const text = "a".repeat(300) + "\u{1F600}";
  const cut = sliceByCodePoint(text, 300);
  assert.equal(cut, "a".repeat(300));
  assert.equal(LONE.test(cut), false);
});

check("truncateText strips first, then cuts by code point", () => {
  const dirty = "a".repeat(299) + "\uD83D";
  const out = truncateText(dirty, 300);
  assert.equal(LONE.test(out), false);
  assert.equal(out.includes("\uFFFD"), true);
  assert.equal(truncateText("short", 300), "short");
});

check("cleanSnippet's 300 boundary lands on a whole emoji", () => {
  const text = "a".repeat(299) + "\u{1F600}" + "b".repeat(50);
  const out = cleanSnippet(text, 300);
  assert.equal(LONE.test(out), false);
  assert.equal(Array.from(out).length, 300);
  assert.equal(out.endsWith("\u{1F600}"), true);
  assert.equal(JSON.stringify({ snippet: out }).includes("\\ud83d"), false);
});

check("sources and search results never carry a lone surrogate", () => {
  const dirty = "x".repeat(10) + "\uD83D";
  const source = sanitizeSource({ url: "https://a.test/1", title: dirty, snippet: dirty, seenIn: ["bing"] });
  assert.equal(LONE.test(source.title), false);
  assert.equal(LONE.test(source.snippet), false);
  assert.deepEqual(source.seenIn, ["bing"]);
  const result = sanitizeSearchResult({ provider: "bing", content: dirty, sources: [source, dirty] });
  assert.equal(LONE.test(result.content), false);
  assert.equal(Array.isArray(result.sources), true);
  assert.equal(sanitizeSources("not an array"), "not an array");
});

check("errors are sanitized before they reach the history", () => {
  const error = new Error("failed for \uD83D reason");
  const safe = sanitizeError(error);
  assert.equal(safe.message.includes("\uD83D"), false);
  assert.equal(safe.message.includes("\uFFFD"), true);
  const clean = new Error("plain");
  assert.equal(sanitizeError(clean), clean);
});

check("the truncation and exit guards are wired in the source", () => {
  assert.match(shared, /return truncateText\(cleaned, max\);/);
  assert.match(shared, /return out\.map\(sanitizeSource\);/);
  assert.match(index, /const safe = sanitizeSearchResult\(await provider\.searchOnce\(request, signal\)\);/);
  assert.match(index, /throw sanitizeError\(error\);/);
  assert.match(index, /stripLoneSurrogates\(typeof text === "string"/);
  assert.match(serp, /import \{ truncateText, stripLoneSurrogates, sliceByCodePoint \} from "\.\/safe_text\.js";/);
  assert.match(serp, /truncateText\(stripTags\(title\)/);
  assert.match(serp, /sliceByCodePoint\(safe, 400\)/);
});

check("web_fetch content is sanitized on every tier", () => {
  const fetchProvider = fs.readFileSync(new URL("lib/fetch_provider.js", root), "utf8");
  const uses = (fetchProvider.match(/stripLoneSurrogates\(/g) || []).length;
  assert.equal(uses >= 5, true, `expected 5 sanitized fetch returns, saw ${uses}`);
});

console.log(`OK: ${checks} safe-text checks passed`);
