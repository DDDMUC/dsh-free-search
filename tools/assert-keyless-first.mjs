// keylessFirst: engines with a keyless tier and a keyed tier try the keyless tier first
// when a key is configured, and fall back to the key when that tier is limited or down.
// Runs the registered search provider against a stubbed fetch. No network or API key.
// Node >= 20, after npm install: node tools/assert-keyless-first.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cacheDir = mkdtempSync(join(tmpdir(), "dsh-keyless-first-"));
for (const name of ["EXA_API_KEY", "TAVILY_API_KEY"]) delete process.env[name];
process.env.RESEARCH_CACHE_DIR = cacheDir;
const originalFetch = globalThis.fetch;

try {
  const { apply, ALL_ENGINES, engineCooldowns, EXA_MCP_URL } = await import("../lib/index.js");
  let checks = 0;
  const check = (name, fn) => { fn(); checks++; console.log(`  ok  ${name}`); };
  const makeProvider = (config = {}) => {
    engineCooldowns.clear();
    let provider;
    const warnings = [];
    apply({
      logger: { info() {}, warn: (message) => warnings.push(message) },
      get() { return undefined; },
      inject() {},
      web: {
        searchProviderId: "custom-search", fetchProviderId: "custom-fetch",
        registerSearchProvider(value) { provider = value; },
        registerFetchProvider() {},
      },
    }, { cache: false, fallbackOn: [], ...config });
    provider.warnings = warnings;
    return provider;
  };
  const only = (engine, config = {}) => makeProvider({
    provider: engine,
    disabledEngines: ALL_ENGINES.filter((id) => id !== engine),
    ...config,
  });

  const tavilyBody = { results: [{ url: "https://example.com/a", title: "Example A", content: "alpha" }] };
  const exaMcpBody = `data: ${JSON.stringify({ result: { content: [{ type: "text", text: "Title: Example B\nURL: https://example.com/b\nHighlights:\nbeta" }] } })}\n`;
  const exaRestBody = { results: [{ url: "https://example.com/c", title: "Example C", highlights: ["gamma"] }] };
  const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
  // Every request is logged as "<tier> <host>" so a test can read which tier was used.
  const calls = [];
  const stub = (handlers) => {
    calls.length = 0;
    globalThis.fetch = async (url, options = {}) => {
      const headers = options.headers ?? {};
      const tier = headers.authorization ? "key" : "keyless";
      const host = new URL(String(url)).hostname;
      // apply() starts a background region lookup; it is not a search request.
      if (/cloudflare\.com|ip\.sb|ipinfo\.io/.test(host)) return reply(500, "");
      calls.push(`${tier} ${host}`);
      const handler = handlers[tier];
      if (typeof handler === "function") return handler();
      return handler;
    };
  };
  const request = { query: "example query words", maxResults: 3 };
  const urls = (result) => result.sources.map((s) => s.url);

  // Tavily: the same URL, a Bearer header marks the keyed tier.
  stub({ key: reply(200, tavilyBody), keyless: reply(200, tavilyBody) });
  let result = await only("tavily", { tavilyApiKey: "tvly-test" }).search(request);
  check("default: a configured key is used and the keyless tier is never touched", () => {
    assert.deepEqual(calls, ["key api.tavily.com"]);
    assert.deepEqual(urls(result), ["https://example.com/a"]);
  });

  calls.length = 0;
  result = await only("tavily", { tavilyApiKey: "tvly-test", keylessFirst: true }).search(request);
  check("keylessFirst: the keyless tier answers and the key is not spent", () => {
    assert.deepEqual(calls, ["keyless api.tavily.com"]);
    assert.deepEqual(urls(result), ["https://example.com/a"]);
  });

  stub({ key: reply(200, tavilyBody), keyless: reply(429, "daily limit reached") });
  let provider = only("tavily", { tavilyApiKey: "tvly-test", keylessFirst: true });
  result = await provider.search(request);
  check("keylessFirst: a rate-limited keyless tier is retried once with the key", () => {
    assert.deepEqual(calls, ["keyless api.tavily.com", "key api.tavily.com"]);
    assert.deepEqual(urls(result), ["https://example.com/a"]);
    assert.ok(provider.warnings.some((line) => /tavily keyless tier failed \[transient\]/.test(line)));
  });
  await provider.search({ ...request, query: "another query" });
  check("keylessFirst: a failed keyless tier rests, so the next search goes straight to the key", () => {
    assert.deepEqual(calls.slice(2), ["key api.tavily.com"]);
  });

  stub({ key: reply(200, tavilyBody), keyless: () => { throw new TypeError("fetch failed"); } });
  result = await only("tavily", { tavilyApiKey: "tvly-test", keylessFirst: true }).search(request);
  check("keylessFirst: a network failure on the keyless tier falls back to the key", () => {
    assert.deepEqual(calls, ["keyless api.tavily.com", "key api.tavily.com"]);
    assert.equal(result.sources.length, 1);
  });

  stub({ key: reply(200, tavilyBody), keyless: reply(401, "unauthorized") });
  await only("tavily", { tavilyApiKey: "tvly-test", keylessFirst: true }).search(request);
  check("keylessFirst: a keyless tier that now wants auth falls back to the key", () => {
    assert.deepEqual(calls, ["keyless api.tavily.com", "key api.tavily.com"]);
  });

  stub({ key: reply(200, tavilyBody), keyless: reply(400, "bad request") });
  await assert.rejects(only("tavily", { tavilyApiKey: "tvly-test", keylessFirst: true }).search(request), /HTTP 400/);
  check("keylessFirst: other failures do not spend the key", () => {
    assert.deepEqual(calls, ["keyless api.tavily.com"]);
  });

  stub({ key: reply(200, tavilyBody), keyless: reply(429, "daily limit reached") });
  await assert.rejects(only("tavily", { keylessFirst: true }).search(request), /HTTP 429/);
  check("keylessFirst without a key behaves as before", () => {
    assert.deepEqual(calls, ["keyless api.tavily.com"]);
  });

  // Exa: keyless MCP endpoint versus REST with a key.
  stub({ key: reply(200, exaRestBody), keyless: reply(200, exaMcpBody) });
  result = await only("exa", { exaApiKey: "exa-test", keylessFirst: true }).search(request);
  check("exa: keylessFirst uses the keyless MCP endpoint and leaves the REST key alone", () => {
    assert.deepEqual(calls, ["keyless mcp.exa.ai"]);
    assert.deepEqual(urls(result), ["https://example.com/b"]);
    assert.equal(new URL(EXA_MCP_URL).hostname, "mcp.exa.ai");
  });

  stub({ key: reply(200, exaRestBody), keyless: reply(429, "") });
  result = await only("exa", { exaApiKey: "exa-test", keylessFirst: true }).search(request);
  check("exa: HTTP 429 from the keyless MCP endpoint switches to the REST key", () => {
    assert.deepEqual(calls, ["keyless mcp.exa.ai", "key api.exa.ai"]);
    assert.deepEqual(urls(result), ["https://example.com/c"]);
  });

  stub({ key: reply(200, exaRestBody), keyless: reply(200, exaMcpBody) });
  await only("exa", { exaApiKey: "exa-test" }).search(request);
  check("exa: without keylessFirst the key is used as before", () => {
    assert.deepEqual(calls, ["key api.exa.ai"]);
  });

  check("the setting defaults off and the settings page loads, saves and renders it", () => {
    const client = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
    const index = readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
    assert.match(index, /keylessFirst: z\.boolean\(\)\.default\(false\)/);
    assert.match(client, /setKeylessFirst\(v\.keylessFirst === true\)/);
    assert.match(client, /path: \["keylessFirst"\], value: keylessFirst === true/);
    assert.match(client, /checked: keylessFirst,/);
  });

  // Multi mode and engine tests run engines through a separate path.
  stub({ key: reply(200, tavilyBody), keyless: reply(429, "daily limit reached") });
  result = await makeProvider({
    provider: "multi", tavilyApiKey: "tvly-test", keylessFirst: true,
    enPool: ["tavily"], disabledEngines: ALL_ENGINES.filter((id) => id !== "tavily"),
  }).search(request);
  check("multi mode: the keyless tier is tried first and the key covers a 429", () => {
    assert.deepEqual(calls.slice(0, 2), ["keyless api.tavily.com", "key api.tavily.com"]);
    assert.deepEqual(urls(result), ["https://example.com/a"]);
  });

  console.log(`OK: ${checks} keyless-first checks passed`);
} finally {
  globalThis.fetch = originalFetch;
}
