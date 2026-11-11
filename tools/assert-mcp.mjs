// MCP stdio surface: initialize, tools, calls and errors. No network.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMcpHandler, searchWeb, fetchWeb } from "../lib/mcp_server.js";

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

await check("tools/list exposes web_search and web_fetch with JSON Schema", async () => {
  const response = await handler({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const names = response.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, ["web_search", "web_fetch"]);
  assert.deepEqual(response.result.tools[0].inputSchema.required, ["query"]);
  assert.equal(response.result.tools[0].inputSchema.additionalProperties, false);
  assert.deepEqual(response.result.tools[1].inputSchema.required, ["url"]);
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
  const fetched = await handler({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "web_fetch", arguments: { url: "https://example.test/x" } },
  });
  assert.equal(fetched.result.content[0].text, "fetched https://example.test/x");
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
