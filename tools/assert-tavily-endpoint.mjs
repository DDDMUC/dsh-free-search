// #153: a Tavily-compatible endpoint can be configured; leaving it empty keeps
// the official API. Keys stay in the credential centre / settings, never in the
// URL, and a bad URL fails loudly instead of silently falling back.
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const { tavilyEndpoint, searchTavily } = await import(new URL("lib/engines/tavily.js", root));
const { Config } = await import(new URL("lib/index.js", root));

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const withFetch = async (stub, fn) => {
  const real = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
};

await check("an empty value keeps the official endpoint", () => {
  assert.equal(tavilyEndpoint(""), "https://api.tavily.com/search");
  assert.equal(tavilyEndpoint("   "), "https://api.tavily.com/search");
  assert.equal(tavilyEndpoint(undefined), "https://api.tavily.com/search");
});

await check("a base gets /search appended; a full URL is kept", () => {
  assert.equal(tavilyEndpoint("https://gw.example"), "https://gw.example/search");
  assert.equal(tavilyEndpoint("https://gw.example/"), "https://gw.example/search");
  assert.equal(tavilyEndpoint("https://gw.example/v1"), "https://gw.example/v1/search");
  assert.equal(tavilyEndpoint("https://gw.example/search"), "https://gw.example/search");
  assert.equal(tavilyEndpoint("http://127.0.0.1:8080"), "http://127.0.0.1:8080/search");
});

await check("query strings and hashes are dropped so the key never leaks into a URL", () => {
  assert.equal(tavilyEndpoint("https://gw.example/search?api_key=leak"), "https://gw.example/search");
  assert.equal(tavilyEndpoint("https://gw.example/search#x"), "https://gw.example/search");
});

await check("non-http schemes and garbage are rejected loudly", () => {
  assert.throws(() => tavilyEndpoint("ftp://gw.example"), /http\(s\)/);
  assert.throws(() => tavilyEndpoint("not a url"), /invalid/i);
});

await check("the key travels in the Authorization header, never the URL", async () => {
  let captured = null;
  await withFetch(
    async (url, init) => {
      captured = { url: String(url), init };
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    },
    async () => {
      await searchTavily("q", 3, "secret-key", undefined, undefined, "https://gw.example/v1");
    }
  );
  assert.equal(captured.url, "https://gw.example/v1/search");
  assert.equal(captured.init.headers.authorization, "Bearer secret-key");
  assert.equal(captured.url.includes("secret-key"), false);
});

await check("the official endpoint is used when no base is configured", async () => {
  let captured = null;
  await withFetch(
    async (url) => {
      captured = String(url);
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    },
    async () => {
      await searchTavily("q", 3, "k", undefined, undefined, "");
    }
  );
  assert.equal(captured, "https://api.tavily.com/search");
});

await check("an auth failure names the configured endpoint so misconfig is visible", async () => {
  await withFetch(
    async () => new Response("nope", { status: 401 }),
    async () => {
      await assert.rejects(
        () => searchTavily("q", 3, "k", undefined, undefined, "https://gw.example/v1"),
        /401|invalid/i
      );
    }
  );
});

await check("the config and settings expose the base URL", async () => {
  const fs = await import("node:fs");
  const cfg = Config({ tavilyBaseUrl: "https://gw.example/v1" });
  assert.equal(cfg.tavilyBaseUrl.get(), "https://gw.example/v1");
  assert.equal(Config({}).tavilyBaseUrl.get(), "");

  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(index, /tavilyBaseUrl: z\.string\(\)\.default\(""\)/);
  assert.match(index, /current\(\)\.tavilyBaseUrl/);

  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /tavilyUrlLabel/);
  assert.match(client, /path: \["tavilyBaseUrl"\]/);

  const mcp = fs.readFileSync(new URL("../lib/mcp_engines.js", import.meta.url), "utf8");
  assert.match(mcp, /MCP_TAVILY_URL/);
});

console.log(`OK: ${checks} tavily endpoint checks passed`);
