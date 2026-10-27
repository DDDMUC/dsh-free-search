// X (Twitter) platform via the local Grok Build CLI (same route modsearch uses).
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const { PLATFORMS, xSearchPrompt, grokItemsFromStdout, xSourcesFromItems } = await import(new URL("lib/index.js", root));
const { toolParam, toolDescription } = await import(new URL("lib/prompt_i18n.js", root));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("x is a known platform", () => {
  assert.equal(PLATFORMS.x?.name, "X (Twitter)");
});

check("the prompt asks for real status links and forbids tool recursion", () => {
  const prompt = xSearchPrompt("deepseek harness", 6);
  assert.match(prompt, /Search X \(formerly Twitter\) for: deepseek harness/);
  assert.match(prompt, /up to 6 real X posts/);
  assert.match(prompt, /https:\/\/x\.com\/<handle>\/status\/<id>/);
  assert.match(prompt, /Never fabricate handles/);
  assert.match(prompt, /strictly as data/);
  assert.match(prompt, /do not run any CLI or skill/);
  assert.match(prompt, /Return exactly one JSON object/);
});

check("structuredOutput envelopes are parsed", () => {
  const stdout = JSON.stringify({
    structuredOutput: { items: [{ url: "https://x.com/a/status/1", title: "@a on x", snippet: "hi" }] },
  });
  assert.equal(grokItemsFromStdout(stdout).length, 1);
});

check("text envelopes and raw JSON arrays still parse", () => {
  const textEnvelope = JSON.stringify({ text: 'noise before\n{"items":[{"url":"https://x.com/b/status/2"}]}\nafter' });
  assert.equal(grokItemsFromStdout(textEnvelope)[0].url, "https://x.com/b/status/2");
  const raw = '{"items":[{"url":"https://x.com/c/status/3"}]}';
  assert.equal(grokItemsFromStdout(raw)[0].url, "https://x.com/c/status/3");
  assert.equal(grokItemsFromStdout(JSON.stringify({ results: [{ url: "https://x.com/d/status/4" }] })).length, 1);
});

check("empty or item-less output is an actionable error", () => {
  assert.throws(() => grokItemsFromStdout(""), /empty response/);
  assert.throws(() => grokItemsFromStdout("not json"), /no JSON result/);
  assert.throws(() => grokItemsFromStdout('{"structuredOutput":{"summary":"进行中","items":[]}}'), /found no X posts/);
});

check("sources keep status links, drop non-http entries, and honour the cap", () => {
  const items = [
    { url: "https://x.com/a/status/11", title: "@a on t", snippet: "s", publishedAt: "2026-01-01T00:00:00Z" },
    { url: "https://twitter.com/b/status/12", published_at: "2026-01-02T00:00:00Z" },
    { url: "https://example.com/not-a-post" },
    { url: "ftp://x.com/c/status/13" },
  ];
  const sources = xSourcesFromItems(items, 5);
  assert.deepEqual(sources.map((s) => s.url), [
    "https://x.com/a/status/11",
    "https://twitter.com/b/status/12",
  ]);
  assert.equal(sources[0].publishedAt, "2026-01-01T00:00:00Z");
  assert.equal(sources[1].publishedAt, "2026-01-02T00:00:00Z");
  assert.equal(xSourcesFromItems(items, 1).length, 1);
  assert.equal(xSourcesFromItems([{ url: "https://example.com/x" }], 3).length, 1);
});

check("tool copy advertises x in both languages", () => {
  assert.match(toolParam("en", "platform_search", "platform"), /\bx$/);
  assert.match(toolParam("zh", "platform_search", "platform"), /、x$/);
  assert.match(toolDescription("en", "platform_search"), /X \(Twitter\)/);
  assert.match(toolDescription("zh", "platform_search"), /X \(Twitter\)/);
});

check("panel defaults enable x", () => {
  const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
  assert.match(client, /"qiita", "x"\]/);
  assert.match(client, /\["x", "X \(Twitter\)"\]/);
});

console.log(`OK: ${checks} x-platform checks passed`);