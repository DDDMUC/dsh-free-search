// #165: deepseek-tools must pass the official rerank_score / authority through,
// annotate them for the model, and support an opt-in score floor.
import assert from "node:assert/strict";
import fs from "node:fs";
import { searchDeepSeekTools } from "../lib/engines/deepseek-tools.js";

const root = new URL("..", import.meta.url);
const engine = fs.readFileSync(new URL("lib/engines/deepseek-tools.js", root), "utf8");
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const mcp = fs.readFileSync(new URL("lib/mcp_server.js", root), "utf8");

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const realFetch = globalThis.fetch;
const stub = (results) => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ results }) });
};
const restore = () => {
  globalThis.fetch = realFetch;
};

// 官方示例的完整形状（含 site_name 与两个质量字段）
const officialRow = (n, score, authority) => ({
  rerank_score: score,
  title: `r${n}`,
  url: `https://example.com/${n}`,
  snippet: "short",
  summary: "long summary",
  content: "",
  site_name: "Example News",
  site_icon: "https://example.com/favicon.ico",
  date: "2026-06-01T00:00:00+00:00",
  authority,
});

const run = async (results, min) => {
  stub(results);
  try {
    return await searchDeepSeekTools("q", 10, "key", undefined, undefined, "", 600, 0, min);
  } finally {
    restore();
  }
};

await check("rerank_score and authority are passed through as score / authority", async () => {
  const result = await run([officialRow(1, 2.4, 3)], 0);
  assert.equal(result.sources[0].score, 2.4);
  assert.equal(result.sources[0].authority, 3);
});

await check("site_name is read (the old code looked for a field that never existed)", async () => {
  const result = await run([officialRow(1, 2.4, 3)], 0);
  assert.equal(result.sources[0].site, "Example News");
});

await check("a compatibility gateway that sends `site` still works", async () => {
  const row = { ...officialRow(1, 2.4, 3), site_name: undefined, site: "Legacy" };
  const result = await run([row], 0);
  assert.equal(result.sources[0].site, "Legacy");
});

await check("unknown authority (-1) is kept, not dropped", async () => {
  const result = await run([officialRow(1, 2.4, -1)], 0);
  assert.equal(result.sources[0].authority, -1, "-1 means unknown and must remain visible");
});

await check("a missing score is simply absent, not zero", async () => {
  const row = { ...officialRow(1, 0, 3) };
  delete row.rerank_score;
  const result = await run([row], 0);
  assert.equal(result.sources[0].score, undefined, "0 and absent must stay distinguishable");
  assert.equal(result.sources[0].authority, 3);
});

await check("minScore 0 keeps everything (no behaviour change by default)", async () => {
  const rows = [officialRow(1, 0.3, 1), officialRow(2, 1.6, 3), officialRow(3, 2.9, 4)];
  const result = await run(rows, 0);
  assert.equal(result.sources.length, 3);
});

await check("minScore filters low-scoring results", async () => {
  const rows = [officialRow(1, 0.3, 1), officialRow(2, 1.6, 3), officialRow(3, 2.9, 4)];
  const result = await run(rows, 1.5);
  assert.deepEqual(result.sources.map((s) => s.score), [1.6, 2.9]);
});

await check("filtering applies after dedupe and before the result cap", async () => {
  // 同一 URL 两次（第二次低分）：去重后保留先到的那条（高分），再按分数裁。
  const rows = [officialRow(1, 2.9, 4), { ...officialRow(1, 0.2, 1), url: "https://example.com/1" }];
  const result = await run(rows, 1.5);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].score, 2.9);
});

await check("an empty result after filtering explains itself", async () => {
  const rows = [officialRow(1, 0.3, 1)];
  const result = await run(rows, 2.0);
  assert.equal(result.sources.length, 0);
  // 走 content 通道：provider 与工具都把它当附注透传给模型。
  assert.match(result.content ?? "", /deepseekToolsMinScore/, "a silent empty result hides the filter");
});

await check("an engine that returns nothing at all has no note", async () => {
  const result = await run([], 2.0);
  assert.equal(result.sources.length, 0);
  assert.equal(result.content, undefined, "no rows means there is nothing to explain");
});

await check("the config key exists and is wired to both call sites", async () => {
  assert.match(index, /deepseekToolsMinScore: z\.number\(\)\.default\(0\)\.volatile\(\)/);
  assert.match(index, /current\(\)\.deepseekToolsMinScore/, "the provider path passes it");
  assert.match(index, /cfg\.deepseekToolsMinScore/, "the test path passes it");
  // 桥接白名单里也要有实体名，否则设置页保存会返回 settings-not-exposed。
  const list = index.slice(index.indexOf('"snippetBudgetChars"'), index.indexOf('"snippetBudgetChars"') + 80);
  assert.match(list.replace(/\n/g, " "), /"deepseekToolsMinScore"/, "the bridge allowlist exposes it");
});

await check("the settings field is clamped to the official 0~3 range", async () => {
  assert.match(client, /Math\.min\(3, Math\.max\(0, Number\(deepseekToolsMinScore\)\)\)/);
  assert.match(client, /minScoreLabel/);
  assert.match(client, /minScoreHint/);
});

await check("quality annotations reach the model-facing text", async () => {
  assert.match(index, /function qualitySuffix/, "the plugin's own tools annotate scores");
  assert.match(index, /qualitySuffix\(s\)/);
  assert.match(mcp, /function qualityTag/, "the MCP server annotates them too");
  assert.match(mcp, /qualityTag\(source\)/);
  // 官方评分是长浮点（2.289104461669922），标注里必须收成两位。
  assert.match(index, /Math\.round\(source\.score \* 100\) \/ 100/);
  assert.match(mcp, /Number\(source\.score\)\.toFixed\(2\)/);
});

await check("both tool schemas now declare the two fields", async () => {
  // additionalProperties: false 会把未声明的字段判为非法，所以 schema 必须同步。
  const advanced = index.slice(index.indexOf('name: "advanced_search"'), index.indexOf('name: "multi_search"'));
  assert.match(advanced, /score: \{ type: "number" \}/);
  assert.match(advanced, /authority: \{ type: "number" \}/);
  const multi = index.slice(index.indexOf('name: "multi_search"'));
  assert.match(multi, /score: \{ type: "number" \}/);
  assert.match(multi, /authority: \{ type: "number" \}/);
});

await check("the merge keeps the fields instead of dropping them", async () => {
  assert.match(index, /out\.score = source\.score/);
  assert.match(index, /out\.authority = source\.authority/);
});

await check("the MCP server reads the floor from the environment", async () => {
  const mcpEngines = fs.readFileSync(new URL("lib/mcp_engines.js", root), "utf8");
  assert.match(mcpEngines, /MCP_DEEPSEEK_MIN_SCORE/);
});

console.log(`OK: ${checks} deepseek quality-signal checks passed`);
