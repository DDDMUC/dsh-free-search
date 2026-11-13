import assert from "node:assert/strict";
import fs from "node:fs";
import { searchDeepSeekTools, deepseekToolsEndpoint } from "../lib/engines/deepseek-tools.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const realFetch = globalThis.fetch;

await check("the default endpoint is unchanged", () => {
  assert.equal(deepseekToolsEndpoint(""), "https://api.deepseek.com/v1/tools/search");
  assert.equal(deepseekToolsEndpoint("https://api.deepseek.com"), "https://api.deepseek.com/v1/tools/search");
});

await check("base and full custom URLs are both accepted", () => {
  assert.equal(deepseekToolsEndpoint("https://gw.example.com"), "https://gw.example.com/v1/tools/search");
  assert.equal(deepseekToolsEndpoint("https://gw.example.com/v1/"), "https://gw.example.com/v1/tools/search");
  assert.equal(deepseekToolsEndpoint("https://gw.example.com/custom/search"), "https://gw.example.com/custom/search");
  assert.equal(deepseekToolsEndpoint("http://127.0.0.1:3000/v1/search"), "http://127.0.0.1:3000/v1/search");
  assert.equal(deepseekToolsEndpoint("http://127.0.0.1:3000/v1/search/"), "http://127.0.0.1:3000/v1/search");
  assert.throws(() => deepseekToolsEndpoint("ftp://gw.example.com"), /http\(s\)/);
  assert.throws(() => deepseekToolsEndpoint("not a url"), /invalid/);
});

await check("the custom endpoint receives the query and bearer key", async () => {
  let url = null;
  let headers = null;
  let body = null;
  globalThis.fetch = async (nextUrl, init) => {
    url = String(nextUrl);
    headers = init.headers;
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ results: [{ title: "A", url: "https://a.test/1", summary: "s" }] }) };
  };
  try {
    const result = await searchDeepSeekTools("q", 5, "custom-key", undefined, undefined, "http://127.0.0.1:3000/v1/search");
    assert.equal(url, "http://127.0.0.1:3000/v1/search");
    assert.equal(headers.authorization, "Bearer custom-key");
    assert.equal(body.query, "q");
    assert.equal(result.sources[0].url, "https://a.test/1");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check("the config and settings UI expose the endpoint", () => {
  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(index, /deepseekToolsBaseUrl: z\.string\(\)\.default\(""\)/);
  assert.match(index, /deepseekToolsApiKey/);
  assert.match(index, /DEEPSEEK_TOOLS_API_KEY/);
  assert.match(index, /deepseekToolsBaseUrl/);
  assert.match(index, /current\(\)\.deepseekToolsBaseUrl/);
  assert.match(client, /deepseekToolsUrlLabel/);
  assert.match(client, /const \[deepseekToolsKey, setDeepseekToolsKey\] = react\.useState\(""\)/);
  assert.match(client, /const \[deepseekToolsUrl, setDeepseekToolsUrl\] = react\.useState\(""\)/);
  assert.match(client, /deepseekToolsKeyLabel/);
  assert.match(client, /\["deepseekToolsApiKey", deepseekToolsKey\]/);
  assert.match(client, /path: \["deepseekToolsBaseUrl"\]/);
});

console.log(`OK: ${checks} deepseek endpoint checks passed`);
