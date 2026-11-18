// MCP stdio surface: initialize, tools, calls and errors. No network.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMcpHandler, searchWeb, fetchWeb, multiSearchWeb, searchDomain, getWeather, searchPlatformWeb, searchVideosWeb, researchWeb, searchCachedPages, testEngines } from "../lib/mcp_server.js";
import { MCP_ENGINE_IDS, MCP_KEYED_ENGINES, MCP_KEYLESS_ENGINES, runMcpEngine } from "../lib/mcp_engines.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const handler = createMcpHandler({
  version: "9.9.9",
  search: async (args) => ({
    engine: "stub",
    sources: [{ title: "Result", url: "https://example.test/a", snippet: `q=${args.query}` }],
  }),
  fetchPage: async (args) => `fetched ${args.url}`,
  multiSearch: async () => ({
    query: "multi",
    engines: ["bing", "ddg"],
    sources: [
      { title: "Shared", url: "https://example.test/shared", snippet: "one", engines: ["bing", "ddg"] },
      { title: "Second", url: "https://example.test/two", snippet: "two", engines: ["ddg"] },
    ],
    errors: ["bing: timeout"],
  }),
  domainSearch: async () => ({
    engine: "pypi",
    query: "requests",
    sources: [{ title: "requests 2.0", url: "https://pypi.org/project/requests", snippet: "HTTP library" }],
  }),
  weather: async () => "weather stub",
  platformSearch: async () => ({
    platform: "github",
    query: "repo",
    sources: [{ title: "owner/repo", url: "https://github.com/owner/repo", snippet: "stars 1" }],
  }),
  videoSearch: async () => ({
    provider: "bing",
    query: "video",
    sources: [{ title: "Video", url: "https://example.test/video", snippet: "1:00" }],
  }),
  research: async () => ({
    question: "why",
    engines: "bing, ddg",
    sources: [{ title: "Source", url: "https://example.test/source", snippet: "evidence" }],
    documents: [{ url: "https://example.test/source", title: "Source", status: 200, truncated: false, content: "Body text" }],
    notes: ["one note"],
    estimatedTokens: 123,
    quality: { level: "medium", sources: 1, domains: 1, dated: 0, fetched: 1, note: "thin evidence" },
  }),
  cacheSearch: async () => ({ query: "cache", hits: [{ url: "https://example.test/c", title: "Cached", excerpt: "cached body", fetched_at: "2026-01-01T00:00:00Z" }] }),
  testEngines: async () => ({ query: "test", results: [{ engine: "bing", ok: true, sources: 2, sample: "Bing result" }] }),
  doctor: async () => "doctor stub",
});

await check("initialize negotiates the protocol and advertises tools", async () => {
  const response = await handler({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } });
  assert.equal(response.result.protocolVersion, "2024-11-05");
  assert.equal(response.result.serverInfo.name, "dsh-free-search");
  assert.equal(response.result.serverInfo.version, "9.9.9");
  assert.deepEqual(response.result.capabilities, { tools: {} });
  const fallback = await handler({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal(fallback.result.protocolVersion, "2025-06-18");
});

await check("tools/list exposes search, advanced, fetch, multi, domain, platform, video and weather with JSON Schema", async () => {
  const response = await handler({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const names = response.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, ["web_search", "advanced_search", "web_fetch", "multi_search", "domain_search", "weather", "platform_search", "video_search", "research", "cache_search", "free_search_test", "doctor"]);
  assert.deepEqual(response.result.tools[0].inputSchema.required, ["query"]);
  assert.equal(response.result.tools[0].inputSchema.additionalProperties, false);
  assert.deepEqual(response.result.tools[1].inputSchema.required, ["query"]);
  assert.deepEqual(response.result.tools[2].inputSchema.required, ["url"]);
  assert.deepEqual(response.result.tools[3].inputSchema.required, ["query"]);
  assert.deepEqual(response.result.tools[4].inputSchema.required, ["engine", "query"]);
  assert.deepEqual(response.result.tools[5].inputSchema.required, ["location"]);
  assert.deepEqual(response.result.tools[6].inputSchema.required, ["platform", "query"]);
  assert.deepEqual(response.result.tools[7].inputSchema.required, ["query"]);
  assert.deepEqual(response.result.tools[8].inputSchema.required, ["question"]);
  assert.deepEqual(response.result.tools[9].inputSchema.required, ["query"]);
  assert.deepEqual(response.result.tools[10].inputSchema.required, ["engines"]);
  assert.equal(response.result.tools[11].inputSchema.required, undefined);
  assert.equal(response.result.tools[3].inputSchema.properties.engines.type, "array");
  assert.ok(response.result.tools[4].inputSchema.properties.engine.enum.includes("pypi"));
  assert.ok(response.result.tools[6].inputSchema.properties.platform.enum.includes("github"));
  assert.deepEqual(response.result.tools[7].inputSchema.properties.source.enum, ["bing", "ddg"]);
});

await check("tools/call returns text content", async () => {
  const response = await handler({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "web_search", arguments: { query: "hello" } },
  });
  assert.equal(response.result.isError, false);
  assert.match(response.result.content[0].text, /Result/);
  assert.match(response.result.content[0].text, /https:\/\/example\.test\/a/);
  assert.match(response.result.content[0].text, /via stub/);
  const advanced = await handler({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "advanced_search", arguments: { query: "hello", time_range: "week" } },
  });
  assert.equal(advanced.result.isError, false);
  assert.match(advanced.result.content[0].text, /via stub/);
  const fetched = await handler({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "web_fetch", arguments: { url: "https://example.test/x" } },
  });
  assert.equal(fetched.result.content[0].text, "fetched https://example.test/x");
  const multi = await handler({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "multi_search", arguments: { query: "multi" } },
  });
  assert.match(multi.result.content[0].text, /\[Shared\]/);
  assert.match(multi.result.content[0].text, /\[bing, ddg\]/);
  assert.match(multi.result.content[0].text, /Some engines failed/);
  const domain = await handler({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "domain_search", arguments: { engine: "pypi", query: "requests" } },
  });
  assert.match(domain.result.content[0].text, /pypi/);
  assert.match(domain.result.content[0].text, /requests 2\.0/);
  const weather = await handler({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "weather", arguments: { location: "Shanghai" } },
  });
  assert.equal(weather.result.content[0].text, "weather stub");
  const platform = await handler({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "platform_search", arguments: { platform: "github", query: "repo" } },
  });
  assert.match(platform.result.content[0].text, /owner\/repo/);
  assert.match(platform.result.content[0].text, /via github/);
  const video = await handler({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "video_search", arguments: { query: "video", source: "bing" } },
  });
  assert.match(video.result.content[0].text, /Video/);
  assert.match(video.result.content[0].text, /via bing/);
  const research = await handler({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "research", arguments: { question: "why" } },
  });
  assert.match(research.result.content[0].text, /# Research: why/);
  assert.match(research.result.content[0].text, /Body text/);
  assert.match(research.result.content[0].text, /thin evidence/);
  const cache = await handler({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: { name: "cache_search", arguments: { query: "cache" } },
  });
  assert.match(cache.result.content[0].text, /Cached pages matching/);
  assert.match(cache.result.content[0].text, /cached body/);
  const tests = await handler({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: { name: "free_search_test", arguments: { engines: ["bing"] } },
  });
  assert.match(tests.result.content[0].text, /Engine test/);
  assert.match(tests.result.content[0].text, /bing: ok/);
  const doctor = await handler({
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: { name: "doctor", arguments: {} },
  });
  assert.equal(doctor.result.content[0].text, "doctor stub");
});

await check("tool failures are isError results, protocol errors stay errors", async () => {
  const bad = await handler({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "nope", arguments: {} },
  });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /unknown tool/);
  const unknown = await handler({ jsonrpc: "2.0", id: 3, method: "nope" });
  assert.equal(unknown.error.code, -32601);
  const invalid = await handler({ jsonrpc: "1.0", id: 4, method: "ping" });
  assert.equal(invalid.error.code, -32600);
  assert.equal(await handler({ jsonrpc: "2.0", method: "notifications/initialized" }), undefined);
});

await check("the real search/fetch entry points validate required arguments", async () => {
  await assert.rejects(() => searchWeb({}), /query is required/);
  await assert.rejects(() => searchWeb({ query: "q", engine: "nope" }), /unknown engine/);
  await assert.rejects(() => searchWeb({ query: "q", safe_search: "nope" }), /invalid safe_search/);
  await assert.rejects(() => fetchWeb({}), /url is required/);
  await assert.rejects(() => multiSearchWeb({}), /query is required/);
  await assert.rejects(() => multiSearchWeb({ query: "q", engines: "bing" }), /non-empty array/);
  await assert.rejects(() => multiSearchWeb({ query: "q", engines: ["nope"] }), /unknown engine/);
  await assert.rejects(() => searchDomain({ query: "q", engine: "nope" }), /unknown domain engine/);
  await assert.rejects(() => getWeather({}), /location is required/);
  await assert.rejects(() => searchPlatformWeb({}), /query is required/);
  await assert.rejects(() => searchPlatformWeb({ query: "q", platform: "nope" }), /unknown platform/);
  await assert.rejects(() => searchVideosWeb({}), /query is required/);
  await assert.rejects(() => researchWeb({}), /question is required/);
  await assert.rejects(() => searchCachedPages({}), /query is required/);
  await assert.rejects(() => testEngines({}), /engines must be a non-empty array/);
  await assert.rejects(() => testEngines({ engines: ["nope"] }), /unknown engine/);
});

await check("multi_search merges duplicate URLs and reports partial engine failures", async () => {
  const runner = async (engine) => {
    if (engine === "ddg") return { engine, sources: [{ title: "D", url: "https://example.test/shared" }, { title: "E", url: "https://example.test/e" }] };
    return { engine, sources: [{ title: "B", url: "https://example.test/shared" }, { title: "C", url: "https://example.test/c" }] };
  };
  const result = await multiSearchWeb({ query: "q", engines: ["bing", "ddg"], max_results: 3 }, runner);
  assert.equal(result.sources.length, 3);
  assert.deepEqual(result.sources[0].engines, ["bing", "ddg"]);
  assert.equal(result.sources[1].url, "https://example.test/c");
  assert.deepEqual(result.errors, []);

  const partial = await multiSearchWeb(
    { query: "q", engines: ["bing", "ddg"], max_results: 2 },
    async (engine) => {
      if (engine === "ddg") throw new Error("quota");
      return { engine, sources: [{ title: "B", url: "https://example.test/b" }] };
    }
  );
  assert.equal(partial.sources.length, 1);
  assert.match(partial.errors[0], /ddg: quota/);
});

await check("keyed engines are explicit and include the new providers", async () => {
  for (const id of ["google", "baidu", "brave", "metaso", "yandex", "yuanbao", "deepseek-tools", "zhipu"]) {
    assert.ok(MCP_ENGINE_IDS.includes(id), id);
    assert.ok(MCP_KEYED_ENGINES.includes(id), id);
  }
  for (const id of ["perplexity", "serpbase", "serply", "outcrawl", "tinyfish", "jina", "kimi", "aliyun", "doubao", "zhihu_global", "zhihu_site", "specstream", "deepseek-official", "openai", "gemini", "claude"]) {
    assert.ok(MCP_ENGINE_IDS.includes(id), id);
    assert.ok(MCP_KEYED_ENGINES.includes(id), id);
  }
  assert.ok(MCP_ENGINE_IDS.includes("degoog"));
  assert.ok(MCP_ENGINE_IDS.includes("agy"));
  for (const id of ["baidu-html", "so360", "sogou", "wechat", "toutiao"]) assert.ok(MCP_ENGINE_IDS.includes(id), id);
  assert.equal(MCP_ENGINE_IDS.includes("auto"), true);
  assert.equal(MCP_KEYED_ENGINES.includes("bing"), false);
  for (const id of ["anysearch", "searxng", "exa", "tavily", "keenable", "firecrawl", "parallel", "you"]) {
    assert.ok(MCP_ENGINE_IDS.includes(id), id);
    assert.ok(MCP_KEYLESS_ENGINES.includes(id), id);
  }
  assert.equal(MCP_KEYLESS_ENGINES.includes("bing"), false);
  const list = await handler({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.ok(list.result.tools[0].inputSchema.properties.engine.enum.includes("exa"));
});

await check("an explicit Zhipu MCP call uses its key and maps results", async () => {
  const realFetch = globalThis.fetch;
  const oldKey = process.env.ZHIPU_API_KEY;
  process.env.ZHIPU_API_KEY = "mcp-zhipu-key";
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      search_result: [{ title: "zhipu", link: "https://example.test/z", content: "hello", publish_date: "2026-11-01" }],
    }),
  });
  try {
    const result = await runMcpEngine("zhipu", "q", { maxResults: 3 });
    assert.equal(result.engine, "zhipu");
    assert.equal(result.sources[0].url, "https://example.test/z");
    assert.equal(result.sources[0].publishedAt, "2026-11-01");
  } finally {
    globalThis.fetch = realFetch;
    if (oldKey === undefined) delete process.env.ZHIPU_API_KEY;
    else process.env.ZHIPU_API_KEY = oldKey;
  }
});

await check("the MCP schema advertises keyed engines and time_range", async () => {
  const response = await handler({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const search = response.result.tools.find((tool) => tool.name === "web_search");
  assert.ok(search.inputSchema.properties.engine.enum.includes("zhipu"));
  assert.deepEqual(search.inputSchema.properties.time_range.enum, ["day", "week", "month", "year"]);
});

await check("the package exposes a stdio bin and ships it", async () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.bin?.["dsh-free-search-mcp"], "./bin/mcp.js");
  assert.equal(pkg.files.includes("bin/"), true);
  const bin = fs.readFileSync(new URL("../bin/mcp.js", import.meta.url), "utf8");
  assert.match(bin, /createMcpHandler/);
  assert.match(bin, /process\.stdout\.write/);
  assert.match(bin, /readline/);
});

console.log(`OK: ${checks} mcp checks passed`);
