// #124: custom DeepSeek-compatible fetch endpoint (POST <base>/fetch) as the
// first fetch tier. Covers URL normalisation, request shape, tier priority and
// fallback to the existing chain.
import assert from "node:assert/strict";
import http from "node:http";
import { CONTROLLED_STUBS } from "../lib/fetch_upstream.js";
import { deepseekFetchEndpoint, fetchViaDeepSeek } from "../lib/fetch_upstream.js";
import { createFetchProvider } from "../lib/fetch_provider.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const resetStubs = () => {
  for (const key of Object.keys(CONTROLLED_STUBS)) CONTROLLED_STUBS[key] = null;
};

await check("the endpoint accepts a base, a trailing slash and a full /fetch URL", () => {
  assert.equal(deepseekFetchEndpoint(""), "");
  assert.equal(deepseekFetchEndpoint("   "), "");
  assert.equal(deepseekFetchEndpoint("http://127.0.0.1:3000/v1"), "http://127.0.0.1:3000/v1/fetch");
  assert.equal(deepseekFetchEndpoint("http://127.0.0.1:3000/v1/"), "http://127.0.0.1:3000/v1/fetch");
  assert.equal(deepseekFetchEndpoint("http://127.0.0.1:3000/v1/fetch"), "http://127.0.0.1:3000/v1/fetch");
  assert.equal(deepseekFetchEndpoint("https://gw.test"), "https://gw.test/fetch");
  assert.throws(() => deepseekFetchEndpoint("ftp://gw.test"), /http\(s\)/);
  assert.throws(() => deepseekFetchEndpoint("not a url"), /invalid/);
});

await check("the official DeepSeek host maps to /v1/tools/fetch (#168)", () => {
  // 官方 Fetch 端点是 /v1/tools/fetch，不是 /fetch。用户只写 host 或 /v1 时必须
  // 补成官方路径，否则会静默 404 并在回退链里被当成上游故障。
  assert.equal(deepseekFetchEndpoint("https://api.deepseek.com"), "https://api.deepseek.com/v1/tools/fetch");
  assert.equal(deepseekFetchEndpoint("https://api.deepseek.com/"), "https://api.deepseek.com/v1/tools/fetch");
  assert.equal(deepseekFetchEndpoint("https://api.deepseek.com/v1"), "https://api.deepseek.com/v1/tools/fetch");
  assert.equal(deepseekFetchEndpoint("https://api.deepseek.com/v1/"), "https://api.deepseek.com/v1/tools/fetch");
  assert.equal(deepseekFetchEndpoint("https://api.deepseek.com/v1/tools"), "https://api.deepseek.com/v1/tools/fetch");
  assert.equal(deepseekFetchEndpoint("https://api.deepseek.com/v1/tools/"), "https://api.deepseek.com/v1/tools/fetch");
  assert.equal(deepseekFetchEndpoint("https://api.deepseek.com/v1/tools/fetch"), "https://api.deepseek.com/v1/tools/fetch");
  // 只有一个 host 走这条规则：别的主机保持网关惯例（/fetch），不能顺手改掉别人的路径。
  assert.equal(deepseekFetchEndpoint("https://deepseek.example.com"), "https://deepseek.example.com/fetch");
  assert.equal(deepseekFetchEndpoint("https://api.deepseek.com.cn"), "https://api.deepseek.com.cn/fetch");
});

await check("the tier runs first and short-circuits the rest of the chain", async () => {
  resetStubs();
  let customCalls = 0;
  let exaCalls = 0;
  CONTROLLED_STUBS.deepseekFetch = async (u, k, s, base) => {
    customCalls += 1;
    assert.equal(u, "https://example.com/a");
    assert.equal(base, "http://127.0.0.1:3000/v1");
    return "gateway body ".repeat(40);
  };
  CONTROLLED_STUBS.exa = async () => { exaCalls += 1; return "e".repeat(500); };
  const provider = createFetchProvider({
    // Every tier uses the stubs below; a key must exist for them to be called.
    resolveApiKey: async () => "k",
    validateUrl: async () => {},
    browserEnabled: () => false,
    deepseekFetch: async () => ({ baseUrl: "http://127.0.0.1:3000/v1", apiKey: "k" }),
  });
  const result = await provider.fetch({ url: "https://example.com/a" }, undefined);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.kind, "text");
  assert.match(result.body.content, /gateway body/);
  assert.equal(customCalls, 1);
  assert.equal(exaCalls, 0, "the direct/exa tiers must not run after a custom hit");
});

await check("a failing custom endpoint falls back to the next tier", async () => {
  resetStubs();
  let customCalls = 0;
  let exaCalls = 0;
  CONTROLLED_STUBS.deepseekFetch = async () => { customCalls += 1; throw new Error("gateway down"); };
  CONTROLLED_STUBS.exa = async () => { exaCalls += 1; return "e".repeat(500); };
  const provider = createFetchProvider({
    // Every tier uses the stubs below; a key must exist for them to be called.
    resolveApiKey: async () => "k",
    validateUrl: async () => {},
    browserEnabled: () => false,
    deepseekFetch: async () => ({ baseUrl: "https://gw.test/v1", apiKey: "" }),
  });
  const result = await provider.fetch({ url: "https://example.com/b" }, undefined);
  assert.equal(result.statusCode, 200);
  assert.match(result.body.content, /^e+$/);
  assert.equal(customCalls, 1);
  assert.equal(exaCalls, 1);
});

await check("no endpoint configured means the tier never runs", async () => {
  resetStubs();
  let customCalls = 0;
  let exaCalls = 0;
  CONTROLLED_STUBS.deepseekFetch = async () => { customCalls += 1; return "x".repeat(500); };
  CONTROLLED_STUBS.exa = async () => { exaCalls += 1; return "e".repeat(500); };
  const provider = createFetchProvider({
    // Every tier uses the stubs below; a key must exist for them to be called.
    resolveApiKey: async () => "k",
    validateUrl: async () => {},
    browserEnabled: () => false,
    deepseekFetch: async () => ({ baseUrl: "", apiKey: "" }),
  });
  await provider.fetch({ url: "https://example.com/c" }, undefined);
  assert.equal(customCalls, 0);
  assert.equal(exaCalls, 1);
});

await check("a short custom body is rejected and the chain continues", async () => {
  resetStubs();
  let exaCalls = 0;
  CONTROLLED_STUBS.deepseekFetch = async () => "tiny";
  CONTROLLED_STUBS.exa = async () => { exaCalls += 1; return "e".repeat(500); };
  const provider = createFetchProvider({
    // Every tier uses the stubs below; a key must exist for them to be called.
    resolveApiKey: async () => "k",
    validateUrl: async () => {},
    browserEnabled: () => false,
    deepseekFetch: async () => ({ baseUrl: "https://gw.test/v1", apiKey: "" }),
  });
  const result = await provider.fetch({ url: "https://example.com/d" }, undefined);
  assert.match(result.body.content, /^e+$/);
  assert.equal(exaCalls, 1);
});

await check("fetchViaDeepSeek posts {url} with a bearer key to <base>/fetch over plain http", async () => {
  let captured;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      captured = {
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ content: "clean gateway markdown" }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const text = await fetchViaDeepSeek("https://example.com/page", "secret", undefined, `http://127.0.0.1:${port}/v1`);
    assert.equal(text, "clean gateway markdown");
    assert.equal(captured.method, "POST");
    assert.equal(captured.url, "/v1/fetch");
    assert.equal(captured.auth, "Bearer secret");
    assert.deepEqual(JSON.parse(captured.body), { url: "https://example.com/page" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

await check("fetchViaDeepSeek reports auth, rate-limit and empty bodies distinctly", async () => {
  const makeServer = (status, payload) => http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  const cases = [
    [401, { error: "bad key" }, /auth rejected/],
    [429, { error: "slow down" }, /rate-limited/],
    [200, { content: "   " }, /empty content/],
    [200, { nope: 1 }, /empty content/],
  ];
  for (const [status, payload, pattern] of cases) {
    const server = makeServer(status, payload);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = server.address().port;
      await assert.rejects(
        () => fetchViaDeepSeek("https://example.com/x", "k", undefined, `http://127.0.0.1:${port}/v1`),
        pattern
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

await check("the config, MCP env and settings UI expose the endpoint", async () => {
  const fs = await import("node:fs");
  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(index, /deepseekFetchBaseUrl: z\.string\(\)\.default\(""\)/);
  assert.match(index, /deepseekFetchApiKey: z\.string\(\)\.role\("secret"\)/);
  assert.match(index, /deepseekFetch: async \(\) => \(\{/);
  const mcp = fs.readFileSync(new URL("../lib/mcp_server.js", import.meta.url), "utf8");
  assert.match(mcp, /MCP_DEEPSEEK_FETCH_URL/);
  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /deepseekFetchUrlLabel/);
  assert.match(client, /path: \["deepseekFetchBaseUrl"\]/);
  assert.match(client, /\["deepseekFetchApiKey", deepseekFetchKey\]/);
});

resetStubs();
console.log(`OK: ${checks} deepseek fetch checks passed`);
