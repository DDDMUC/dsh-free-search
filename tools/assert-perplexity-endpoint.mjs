// Custom Perplexity endpoint, model selection, and answer-URL citation extraction tests.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";

const root = new URL("..", import.meta.url);
const {
  PERPLEXITY_URL,
  PERPLEXITY_DEFAULT_MODEL,
  perplexityEndpoint,
  extractPerplexitySources,
  searchPerplexity,
} = await import(new URL("lib/engines/perplexity.js", root));
const { Config } = await import(new URL("lib/index.js", root));
const { runMcpEngine, doctorReport } = await import(new URL("lib/mcp_server.js", root)).then(async (srv) => ({
  doctorReport: srv.doctorReport,
  ...(await import(new URL("lib/mcp_engines.js", root))),
}));

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

await check("empty endpoint defaults to official Perplexity chat completions URL", () => {
  assert.equal(perplexityEndpoint(""), PERPLEXITY_URL);
  assert.equal(perplexityEndpoint("   "), PERPLEXITY_URL);
  assert.equal(perplexityEndpoint(undefined), PERPLEXITY_URL);
});

await check("endpoint normalizes custom proxy bases and keeps explicit /chat/completions paths", () => {
  assert.equal(perplexityEndpoint("https://api.perplexity.ai"), "https://api.perplexity.ai/chat/completions");
  assert.equal(perplexityEndpoint("http://127.0.0.1:8787"), "http://127.0.0.1:8787/v1/chat/completions");
  assert.equal(perplexityEndpoint("http://127.0.0.1:8787/v1"), "http://127.0.0.1:8787/v1/chat/completions");
  assert.equal(perplexityEndpoint("http://127.0.0.1:8787/v1/"), "http://127.0.0.1:8787/v1/chat/completions");
  assert.equal(perplexityEndpoint("http://127.0.0.1:8787/v1/chat/completions"), "http://127.0.0.1:8787/v1/chat/completions");
  assert.equal(perplexityEndpoint("https://gw.example/openai/v1"), "https://gw.example/openai/v1/chat/completions");
});

await check("query strings and hashes are stripped from endpoint URLs", () => {
  assert.equal(perplexityEndpoint("https://gw.example/v1?api_key=leak#frag"), "https://gw.example/v1/chat/completions");
});

await check("invalid or non-http endpoints fail loudly", () => {
  assert.throws(() => perplexityEndpoint("ftp://gw.example/v1"), /http\(s\)/);
  assert.throws(() => perplexityEndpoint("not a valid url"), /invalid/i);
});

await check("default official endpoint still requires an API key", async () => {
  await assert.rejects(() => searchPerplexity("query", 3, ""), /PERPLEXITY_API_KEY/);
  await assert.rejects(() => searchPerplexity("query", 3, "", new AbortController().signal), /PERPLEXITY_API_KEY/);
});

await check("backward-compatible fourth-arg AbortSignal still forwards cancellation", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  await withFetch(
    async (_url, init) => {
      assert.equal(init.signal.aborted, true);
      throw init.signal.reason;
    },
    async () => {
      await assert.rejects(() => searchPerplexity("query", 3, "pplx-test", controller.signal), /request aborted/);
    }
  );
});

await check("custom endpoint works without API key and sends configured model", async () => {
  let captured = null;
  await withFetch(
    async (url, init) => {
      captured = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: "Use [Node Docs](https://nodejs.org/api/test.html?utm_source=perplexity) and https://modelcontextprotocol.io/.",
            },
          },
        ],
      }), { status: 200 });
    },
    async () => {
      const result = await searchPerplexity("node test runner", 5, "", {
        baseUrl: "http://127.0.0.1:8787/v1",
        model: "sonar-pro",
      });
      assert.equal(captured.url, "http://127.0.0.1:8787/v1/chat/completions");
      assert.equal(captured.headers.authorization, undefined);
      assert.equal(captured.body.model, "sonar-pro");
      assert.equal(captured.body.messages.length, 2);
      assert.equal(captured.body.messages[0].role, "system");
      assert.equal(result.sources.length, 2);
      assert.deepEqual(
        result.sources.map((s) => s.url),
        ["https://nodejs.org/api/test.html", "https://modelcontextprotocol.io/"]
      );
      assert.equal(result.sources[0].title, "Node Docs");
    }
  );
});

await check("extractPerplexitySources merges structured citations, annotations, grounding chunks, and content links without duplicates", () => {
  const sources = extractPerplexitySources({
    citations: ["https://example.org/one?utm_medium=referral", { url: "https://example.org/two", title: "Two" }],
    search_results: [{ url: "https://example.org/three", title: "Three", snippet: "Custom snippet", date: "2026-11-28" }],
    choices: [
      {
        message: {
          annotations: [{
            type: "url_citation",
            url_citation: { url: "https://example.org/one", title: "One", content: "OpenRouter excerpt" },
          }],
          content: "See [One](https://example.org/one) and [Four](https://example.org/four).\n[5]: https://example.org/five \"Five\"",
        },
      },
    ],
    groundingMetadata: {
      groundingChunks: [{ web: { uri: "https://example.org/six", title: "Gemini Source" } }],
    },
  }, 10);

  assert.deepEqual(
    sources.map((s) => s.url),
    [
      "https://example.org/one",
      "https://example.org/two",
      "https://example.org/three",
      "https://example.org/six",
    ]
  );
  assert.equal(sources[0].title, "One");
  assert.equal(sources[0].snippet, "OpenRouter excerpt");
  assert.equal(sources[2].snippet, "Custom snippet");
  assert.equal(sources[2].publishedAt, "2026-11-28");
  assert.equal(sources[3].title, "Gemini Source");
  assert.equal(sources.length, 4);
});

await check("OpenAI web-search-preview model receives web_search_options automatically", async () => {
  let sentBody = null;
  await withFetch(
    async (_url, init) => {
      sentBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Answer [Ref](https://openai.com/news)." } }],
      }), { status: 200 });
    },
    async () => {
      const out = await searchPerplexity("latest release", 3, "", {
        baseUrl: "https://gateway.example/v1",
        model: "gpt-4o-search-preview",
      });
      assert.deepEqual(sentBody.web_search_options, { search_context_size: "medium" });
      assert.equal(out.sources[0].url, "https://openai.com/news");
    }
  );
});

await check("MCP dispatch and loopback proxy work with MCP_PERPLEXITY_BASE_URL without PERPLEXITY_API_KEY", async () => {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const body = JSON.parse(raw);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        model: body.model,
        choices: [
          {
            message: {
              content: `Model ${body.model}: [SAP Proxy](https://github.com/chirag127/sap-aic-openai-proxy)`,
            },
          },
        ],
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const oldUrl = process.env.MCP_PERPLEXITY_BASE_URL;
  const oldModel = process.env.MCP_PERPLEXITY_MODEL;
  const oldKey = process.env.PERPLEXITY_API_KEY;
  process.env.MCP_PERPLEXITY_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.MCP_PERPLEXITY_MODEL = "sonar-pro";
  delete process.env.PERPLEXITY_API_KEY;

  try {
    const out = await runMcpEngine("perplexity", "sap proxy", { maxResults: 3 });
    assert.equal(out.engine, "perplexity");
    assert.equal(out.sources[0].url, "https://github.com/chirag127/sap-aic-openai-proxy");
    assert.match(out.content, /Model sonar-pro/);

    const doc = await doctorReport({ engines: ["perplexity"] });
    assert.match(doc, /\* perplexity\s+key ok \(PERPLEXITY_API_KEY\)/);
  } finally {
    if (oldUrl === undefined) delete process.env.MCP_PERPLEXITY_BASE_URL;
    else process.env.MCP_PERPLEXITY_BASE_URL = oldUrl;
    if (oldModel === undefined) delete process.env.MCP_PERPLEXITY_MODEL;
    else process.env.MCP_PERPLEXITY_MODEL = oldModel;
    if (oldKey === undefined) delete process.env.PERPLEXITY_API_KEY;
    else process.env.PERPLEXITY_API_KEY = oldKey;
    await new Promise((resolve) => server.close(resolve));
  }
});

await check("Config and Settings UI wire perplexityBaseUrl and perplexityModel cleanly", () => {
  const cfg = Config({ perplexityBaseUrl: "http://127.0.0.1:8787/v1", perplexityModel: "sonar-pro" });
  assert.equal(cfg.perplexityBaseUrl.get(), "http://127.0.0.1:8787/v1");
  assert.equal(cfg.perplexityModel.get(), "sonar-pro");
  assert.equal(Config({}).perplexityBaseUrl.get(), "");
  assert.equal(Config({}).perplexityModel.get(), "");

  const indexSrc = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  const clientSrc = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(indexSrc, /perplexityBaseUrl: z\.string\(\)\.default\(""\)/);
  assert.match(indexSrc, /perplexityModel: z\.string\(\)\.default\(""\)/);
  assert.match(indexSrc, /id === "perplexity" && String\(cfg\.perplexityBaseUrl \?\? ""\)\.trim\(\) !== ""/);
  assert.match(clientSrc, /ENGINE_SETTINGS_IDS = \[[^\]]*"perplexity"/);
  assert.match(clientSrc, /engineSettingField\("perplexityUrl"/);
  assert.match(clientSrc, /engineSettingField\("perplexityModel"/);
  assert.match(clientSrc, /path: \["perplexityBaseUrl"\]/);
  assert.match(clientSrc, /path: \["perplexityModel"\]/);
  assert.equal(PERPLEXITY_DEFAULT_MODEL, "sonar");
});

await check("rejects endpoint and citation userinfo", () => {
  assert.throws(() => perplexityEndpoint("https://user:secret@gateway.example/v1"), /credentials/);
  assert.deepEqual(extractPerplexitySources({ citations: ["https://user:secret@example.org/a"] }), []);
});

await check("fallback preserves balanced parentheses and reference titles", () => {
  const sources = extractPerplexitySources({ choices: [{ message: { content: '[Wiki](https://example.org/A_(B)).\n[2]: https://example.org/ref "Reference"' } }] });
  assert.deepEqual(sources.map(s => s.url), ["https://example.org/ref", "https://example.org/A_(B)"]);
  assert.equal(sources[0].title, "Reference");
  assert.equal(sources[1].title, "Wiki");
});

await check("blocked structured sources do not activate prose fallback", async () => {
  const { setActiveBlockedDomains } = await import("../lib/domain_filter.js");
  setActiveBlockedDomains(["example.org"]);
  try {
    assert.deepEqual(extractPerplexitySources({ citations: ["https://example.org/a"], choices: [{ message: { content: "https://other.example/a" } }] }), []);
  } finally { setActiveBlockedDomains([]); }
});

await check("network HTTP and JSON errors never echo secrets", async () => {
  const secret = "test-private-credential";
  for (const stub of [
    async () => { throw new Error(secret); },
    async () => new Response(secret, { status: 500 }),
    async () => new Response(secret, { status: 401 }),
    async () => new Response(secret, { status: 403 }),
    async () => new Response(secret, { status: 200 }),
  ]) {
    await withFetch(stub, () => assert.rejects(() => searchPerplexity("q", 3, secret, { baseUrl: `https://gateway.example/${secret}` }), error => {
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.match(error.message, /Perplexity/);
      return true;
    }));
  }
});

await check("malformed response shapes fail safely", async () => {
  for (const data of [null, [], {}, { error: "secret" }, { choices: {} }, { choices: [{ message: { content: [] } }] }, { choices: [{ message: { content: "answer" } }], citations: {} }, { choices: [{ message: { content: "answer", annotations: {} } }] }]) {
    await withFetch(async () => new Response(JSON.stringify(data)), () => assert.rejects(() => searchPerplexity("q", 3, "key"), /invalid response/));
  }
});

console.log(`OK: ${checks} perplexity custom endpoint checks passed`);
