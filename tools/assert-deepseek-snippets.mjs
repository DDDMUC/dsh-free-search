// deepseek-tools snippet caps: default 600, 0 = unlimited, optional total budget.
import assert from "node:assert/strict";
import { searchDeepSeekTools } from "../lib/engines/deepseek-tools.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const rows = (length) =>
  Array.from({ length: 10 }, (_, i) => ({
    title: `r${i}`,
    url: `https://example.com/${i}`,
    summary: "x".repeat(length),
    snippet: "y".repeat(20),
    site: "Example News",
    date: "2026-11-01T00:00:00Z",
  }));
const realFetch = globalThis.fetch;
const run = async (length, max, budget) => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results: rows(length) }),
  });
  try {
    return await searchDeepSeekTools("q", 10, "key", undefined, undefined, "", max, budget);
  } finally {
    globalThis.fetch = realFetch;
  }
};

await check("default remains 600 characters", async () => {
  const result = await run(1000, 600, 0);
  assert.equal(result.sources[0].snippet.length, 600);
});

await check("snippetMaxChars 0 keeps the full combined summary+snippet", async () => {
  const result = await run(1000, 0, 0);
  assert.equal(result.sources[0].snippet.length, 1021);
});

await check("a total budget is respected", async () => {
  const result = await run(2000, 2000, 12000);
  const total = result.sources.reduce((sum, source) => sum + (source.snippet?.length ?? 0), 0);
  assert.ok(total <= 12000, String(total));
  assert.ok(total > 0);
});

await check("small entries survive the budget", async () => {
  const result = await run(2000, 2000, 12000);
  assert.ok(result.sources.every((source) => source.snippet.length > 0));
});

await check("summary and snippet are joined when both exist, and site is kept", async () => {
  const result = await run(10, 0, 0);
  assert.equal(result.sources[0].snippet, `${"x".repeat(10)}\n${"y".repeat(20)}`);
  assert.equal(result.sources[0].site, "Example News");
});

console.log(`OK: ${checks} deepseek snippet checks passed`);
