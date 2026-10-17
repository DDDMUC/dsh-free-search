// Regression checks through the registered search provider. No network or API key.
// Node >= 20, after npm install: node tools/assert-parallel-mcp.mjs
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cacheDir = mkdtempSync(join(tmpdir(), "dsh-parallel-test-"));
const savedKey = process.env.PARALLEL_API_KEY;
const savedCacheDir = process.env.RESEARCH_CACHE_DIR;
delete process.env.PARALLEL_API_KEY;
process.env.RESEARCH_CACHE_DIR = cacheDir;
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

try {
  const { apply, ALL_ENGINES, engineCooldowns } = await import("../lib/index.js");
  let checks = 0;
  const check = (name, fn) => { fn(); checks++; console.log(`  ok  ${name}`); };
  const makeProvider = (config = {}) => {
    engineCooldowns.clear();
    let provider;
    const web = {
      searchProviderId: "custom-search", fetchProviderId: "custom-fetch",
      registerSearchProvider(value) { provider = value; },
      registerFetchProvider() {},
    };
    apply({
      logger: { info() {}, warn() {} },
      get() { return undefined; }, // No saved credentials service.
      inject() {}, // Optional host services are absent.
      web,
    }, {
      provider: "parallel", cache: false, fallbackOn: [],
      disabledEngines: ALL_ENGINES.filter((engine) => engine !== "parallel"),
      ...config,
    });
    assert.equal(web.searchProviderId, "custom-search");
    assert.equal(web.fetchProviderId, "custom-fetch");
    return provider;
  };
  const payload = { results: [
    { url: "https://nodejs.org/api/", title: "Node.js API", excerpts: ["", "Official API reference"], publish_date: "2026-10-01" },
    { url: "https://nodejs.org/api/", title: "Duplicate", excerpts: [] },
    { url: "https://example.com/guide", title: "Guide", excerpts: ["x".repeat(350)] },
  ] };
  const envelope = (value = payload) => ({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(value) }] } });
  const request = { query: "Node.js API reference", maxResults: 2 };
  const bodies = [];
  const stub = (raw, status = 200) => {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://search.parallel.ai/mcp");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["content-type"], "application/json");
      assert.equal(options.headers.accept, "application/json, text/event-stream");
      assert.equal(options.headers["user-agent"], "dsh-free-search (+https://github.com/DDDMUC/dsh-free-search)");
      assert.ok(!Object.keys(options.headers).some((key) => /authorization|api-key/i.test(key)));
      const body = JSON.parse(options.body);
      assert.equal(body.method, "tools/call");
      assert.equal(body.params.name, "web_search");
      assert.deepEqual(body.params.arguments.search_queries, [request.query]);
      assert.match(body.params.arguments.session_id, /^[0-9a-f]{32}$/);
      bodies.push(body);
      return { ok: status >= 200 && status < 300, status, text: async () => raw };
    };
  };

  stub(JSON.stringify(envelope()));
  const jsonResult = await makeProvider().search(request);
  check("registered provider consumes JSON, deduplicates, and preserves metadata", () => {
    assert.equal(jsonResult.provider, "parallel");
    assert.equal(jsonResult.sources.length, 2);
    assert.deepEqual(jsonResult.sources[0], { url: "https://nodejs.org/api/", title: "Node.js API", snippet: "Official API reference", publishedAt: "2026-10-01" });
    assert.equal(jsonResult.sources[1].snippet.length, 300);
    assert.equal(jsonResult.truncated, false);
  });
  check("request keeps objective and session identity", () => assert.equal(bodies[0].params.arguments.objective, request.query));

  const notification = JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { data: "Searching" } });
  const multiline = JSON.stringify(envelope(), null, 2).split("\n").map((line) => `data:${line}`).join("\r\n");
  stub(`data: ${notification}\r\n\r\nevent: message\r\n${multiline}\r\n\r\n`);
  const sseResult = await makeProvider().search({ ...request, maxResults: 1, timeRange: "2026-10-01" });
  check("SSE notification before multiline result does not discard sources", () => {
    assert.equal(sseResult.sources.length, 1);
    assert.deepEqual(sseResult.sources[0], jsonResult.sources[0]);
    assert.equal(bodies.at(-1).params.arguments.objective, `${request.query} (prefer results published after 2026-10-01)`);
    assert.equal(bodies.at(-1).params.arguments.session_id, bodies[0].params.arguments.session_id);
  });

  for (const [name, raw, pattern, status = 200] of [
    ["JSON-RPC error", JSON.stringify({ error: { message: "search rejected" } }), /search rejected/],
    ["tool error", JSON.stringify({ result: { isError: true, content: [{ type: "text", text: "quota exceeded" }] } }), /quota exceeded/],
    ["HTTP auth error", "", /HTTP 401/, 401],
    ["malformed envelope", "not JSON", /parse failed/],
    ["missing content", JSON.stringify({ result: {} }), /malformed content/],
    ["malformed payload", JSON.stringify(envelope({ results: null })), /malformed search results/],
  ]) {
    stub(raw, status);
    await assert.rejects(makeProvider().search(request), pattern);
    check(name + " surfaces through provider", () => {});
  }
  const leadingText = envelope();
  leadingText.result.content.unshift({ type: "text", text: "null" });
  stub(JSON.stringify(leadingText));
  assert.equal((await makeProvider().search(request)).sources.length, 2);
  check("non-result text block is skipped", () => {});

  const waitForAbort = (signal) => new Promise((resolve, reject) => {
    const fail = () => reject(new DOMException("The operation was aborted", "AbortError"));
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
  const outer = new AbortController();
  let bodyReads = 0;
  globalThis.fetch = async (url, { signal }) => {
    if (signal.aborted) { await waitForAbort(signal); }
    return { ok: true, text: () => {
      bodyReads++;
      const pending = waitForAbort(signal);
      outer.abort(); // Headers already returned; response body is still pending.
      return pending;
    } };
  };
  await assert.rejects(makeProvider().search(request, outer.signal), /abort/i);
  check("caller abort reaches a pending body read", () => assert.equal(bodyReads, 1));

  const preAborted = new AbortController();
  preAborted.abort();
  let sawAborted = false;
  globalThis.fetch = async (url, { signal }) => { sawAborted = signal.aborted; return await waitForAbort(signal); };
  await assert.rejects(makeProvider().search(request, preAborted.signal), /abort/i);
  check("already-aborted caller signal reaches fetch", () => assert.equal(sawAborted, true));

  const timers = new Map();
  let timerId = 0;
  globalThis.setTimeout = (fn, ms, ...args) => {
    if (ms !== 25000) return originalSetTimeout(fn, ms, ...args);
    const id = ++timerId;
    timers.set(id, fn);
    return id;
  };
  globalThis.clearTimeout = (id) => { if (!timers.delete(id)) originalClearTimeout(id); };
  let timedOutBodies = 0;
  globalThis.fetch = async (url, { signal }) => ({ ok: true, text: () => {
    timedOutBodies++;
    const pending = waitForAbort(signal);
    assert.equal(timers.size, 1, "25s timeout remains active after response headers");
    [...timers.values()][0]();
    return pending;
  } });
  await assert.rejects(makeProvider().search(request), /abort/i);
  check("25s timeout covers body read and transient retry; timers cleaned", () => {
    assert.equal(timedOutBodies, 2); // Existing one-retry policy is preserved.
    assert.equal(timers.size, 0);
  });
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;

  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.parallel.ai/v1/search");
    assert.equal(options.headers["x-api-key"], "configured-test-key");
    const body = JSON.parse(options.body);
    assert.equal(body.mode, "fast");
    assert.deepEqual(body.advanced_settings.source_policy, { after_date: "2026-10-01" });
    return { ok: true, json: async () => payload };
  };
  const keyedResult = await makeProvider({ parallelApiKey: "configured-test-key" }).search({ ...request, timeRange: "2026-10-01" });
  check("explicit API key still selects REST with precise time filtering", () => assert.equal(keyedResult.sources.length, 2));

  stub(JSON.stringify(envelope()));
  const config = { disabledEngines: ALL_ENGINES, cache: false };
  await assert.rejects(makeProvider(config).search(request), /all search engines are disabled/);
  check("disabled Parallel remains disabled", () => {});
  engineCooldowns.clear();
  console.log(`OK: ${checks} Parallel MCP checks passed`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  if (savedKey === undefined) delete process.env.PARALLEL_API_KEY;
  else process.env.PARALLEL_API_KEY = savedKey;
  if (savedCacheDir === undefined) delete process.env.RESEARCH_CACHE_DIR;
  else process.env.RESEARCH_CACHE_DIR = savedCacheDir;
  try { rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
}
