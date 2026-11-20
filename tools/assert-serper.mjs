// #157: Serper.dev (google.serper.dev) is a Google SERP proxy distinct from
// SerpBase/Serply — same family, different endpoint, header and time syntax.
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const { SERPER_URL } = await import(new URL("lib/engines/shared.js", root));
const { searchSerper } = await import(new URL("lib/engines/serper.js", root));
const meta = await import(new URL("lib/engine_meta.js", root));

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

await check("the endpoint constant points at google.serper.dev/search", () => {
  assert.equal(SERPER_URL, "https://google.serper.dev/search");
});

await check("the request uses X-API-KEY, num and the Google locale fields", async () => {
  let captured = null;
  await withFetch(
    async (url, init) => {
      captured = { url: String(url), init };
      return new Response(JSON.stringify({ organic: [] }), { status: 200, headers: { "content-type": "application/json" } });
    },
    async () => {
      await searchSerper("deepseek harness", 5, "secret-key", { lang: "en" });
    }
  );
  assert.equal(captured.url, SERPER_URL);
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers["X-API-KEY"], "secret-key");
  assert.equal(captured.init.headers.authorization, undefined, "Serper does not use Bearer");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.q, "deepseek harness");
  assert.equal(body.num, 5);
  assert.equal(body.hl, "en");
  assert.equal(body.gl, "us");
});

await check("num is clamped to Serper's ceiling of 100", async () => {
  let captured = null;
  await withFetch(
    async (url, init) => {
      captured = init;
      return new Response(JSON.stringify({ organic: [] }), { status: 200 });
    },
    async () => {
      await searchSerper("q", 500, "k", {});
    }
  );
  assert.equal(JSON.parse(captured.body).num, 100);
});

await check("time ranges map to Google tbs syntax", async () => {
  const cases = [
    [{ days: 1 }, "qdr:d"],
    [{ days: 7 }, "qdr:w"],
    [{ days: 30 }, "qdr:m"],
    [{ days: 365 }, "qdr:y"],
  ];
  for (const [timeRange, expected] of cases) {
    let captured = null;
    await withFetch(
      async (url, init) => {
        captured = init;
        return new Response(JSON.stringify({ organic: [] }), { status: 200 });
      },
      async () => {
        await searchSerper("q", 3, "k", { timeRange });
      }
    );
    assert.equal(JSON.parse(captured.body).tbs, expected, JSON.stringify(timeRange));
  }
});

await check("an absolute after date becomes a cd_min range", async () => {
  let captured = null;
  await withFetch(
    async (url, init) => {
      captured = init;
      return new Response(JSON.stringify({ organic: [] }), { status: 200 });
    },
    async () => {
      await searchSerper("q", 3, "k", { timeRange: { after: "2026-03-05" } });
    }
  );
  assert.equal(JSON.parse(captured.body).tbs, "cdr:1,cd_min:3/5/2026");
});

await check("organic results map to sources", async () => {
  const payload = {
    organic: [
      { title: "A", link: "https://a.example/1", snippet: "sa", date: "2026-01-02" },
      { title: "B", link: "https://b.example/2" },
      { title: "no link" },
    ],
  };
  const result = await withFetch(
    async () => new Response(JSON.stringify(payload), { status: 200 }),
    async () => searchSerper("q", 10, "k", {})
  );
  assert.equal(result.sources.length, 2);
  assert.deepEqual(result.sources[0], { url: "https://a.example/1", title: "A", snippet: "sa", publishedAt: "2026-01-02" });
  assert.equal(result.sources[1].url, "https://b.example/2");
  assert.equal(result.truncated, false);
});

await check("401, 403 and 429 surface distinct messages", async () => {
  const cases = [
    [401, /invalid|unauthor/i],
    [403, /forbidden|invalid|unauthor/i],
    [429, /quota|rate|limit/i],
  ];
  for (const [status, pattern] of cases) {
    await withFetch(
      async () => new Response("{}", { status }),
      async () => {
        await assert.rejects(() => searchSerper("q", 3, "k", {}), pattern, `HTTP ${status}`);
      }
    );
  }
});

await check("a missing key fails fast with the env name", async () => {
  await assert.rejects(() => searchSerper("q", 3, "", {}), /SERPER_API_KEY/);
});

await check("the catalog wires serper into every derived list", () => {
  assert.equal(meta.ALL_ENGINES.includes("serper"), true);
  assert.equal(meta.FREE_ENGINES.includes("serper"), false, "serper always needs a key");
  assert.equal(meta.TIME_ENGINES.includes("serper"), true, "tbs supports time filtering");
  const order = meta.DEFAULT_FALLBACK_ORDER;
  const at = order.indexOf("serper");
  assert.ok(at > 0, "serper must be in the default chain");
  assert.equal(order[at - 1], "serpbase", "serper sits right after serpbase");
});

await check("index, MCP and the settings client all know serper", async () => {
  const fs = await import("node:fs");
  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(index, /import \{ searchSerper \} from "\.\/engines\/serper\.js"/);
  assert.match(index, /serperApiKey: "SERPER_API_KEY"/);
  assert.match(index, /serperApiKey: z\.string\(\)\.role\("secret"\)/);
  assert.match(index, /case "serper":/);

  const mcp = fs.readFileSync(new URL("../lib/mcp_engines.js", import.meta.url), "utf8");
  assert.match(mcp, /"serper"/);
  assert.match(mcp, /case "serper"/);
  assert.match(mcp, /SERPER_API_KEY/);

  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /id: "serper"/);
  assert.match(client, /serper: \[serperKey, setSerperKey\]/);
  assert.match(client, /serperApiKey/);
});

console.log(`OK: ${checks} serper checks passed`);
