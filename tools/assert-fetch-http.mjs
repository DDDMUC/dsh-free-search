// Plain-http targets in the fetch chain (#143): the provider-level "only https"
// assertion is gone, T1 picks its transport per hop, and a proxy-only egress can
// still fetch http pages through a plain CONNECT tunnel.
// Fully offline: local http servers play the origin and the CONNECT proxy.
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";

const { createFetchProvider, httpsGetFollow } = await import("../lib/fetch_provider.js");
const { CONTROLLED_STUBS } = await import("../lib/fetch_upstream.js");
const { HttpTunnelAgent, TunnelAgent, agentForUrl } = await import("../lib/proxy.js");

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const BODY = `<html><body><p>${"http-body ".repeat(80)}</p></body></html>`;
const silent = { info() {}, warn() {}, error() {}, debug() {} };

const withServer = async (handler, run) => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run({ port: server.address().port });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
};

// ---------- T1 direct ----------
await check("httpsGetFollow picks the plain-http transport for an http target", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(BODY);
    },
    async ({ port }) => {
      const result = await httpsGetFollow(`http://127.0.0.1:${port}/page`, { timeoutMs: 3000 });
      assert.equal(result.status, 200);
      assert.ok(result.text.includes("http-body"));
    }
  );
});

await check("an http target that redirects to another http page is followed", async () => {
  await withServer(
    (req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { location: "/final" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("final-page ".repeat(80));
    },
    async ({ port }) => {
      const result = await httpsGetFollow(`http://127.0.0.1:${port}/start`, { timeoutMs: 3000 });
      assert.equal(result.status, 200);
      assert.ok(result.text.startsWith("final-page"));
    }
  );
});

// ---------- the provider no longer rejects http up front ----------
await check("the provider lets an http target fall through to the tier chain", async () => {
  for (const key of Object.keys(CONTROLLED_STUBS)) CONTROLLED_STUBS[key] = null;
  let exaCalls = 0;
  CONTROLLED_STUBS.exa = async () => {
    exaCalls += 1;
    return "e".repeat(500);
  };
  const provider = createFetchProvider({
    resolveApiKey: async (env) => ({ EXA_API_KEY: "k", FIRECRAWL_API_KEY: "k", CRAWL4AI_API_KEY: "k" })[env],
    logger: silent,
    validateUrl: async () => {},
    browserEnabled: () => false,
  });
  const hit = await provider.fetch({ url: "http://127.0.0.1:1/unreachable" }, undefined);
  assert.equal(hit.statusCode, 200);
  assert.equal(hit.body.kind, "text");
  assert.equal(exaCalls, 1);
});

await check("an all-tiers failure reports the direct error instead of an https-only assertion", async () => {
  for (const key of Object.keys(CONTROLLED_STUBS)) CONTROLLED_STUBS[key] = null;
  CONTROLLED_STUBS.exa = async () => {
    throw new Error("exa down");
  };
  CONTROLLED_STUBS.firecrawl = async () => {
    throw new Error("fc down");
  };
  CONTROLLED_STUBS.crawl4ai = async () => {
    throw new Error("c4 down");
  };
  const provider = createFetchProvider({
    resolveApiKey: async () => undefined,
    logger: silent,
    validateUrl: async () => {},
    browserEnabled: () => false,
  });
  let threw = null;
  try {
    await provider.fetch({ url: "http://127.0.0.1:1/unreachable" }, undefined);
  } catch (error) {
    threw = error;
  }
  assert.ok(threw !== null, "全层失败必须抛错");
  assert.match(threw.message, /direct:/);
  assert.doesNotMatch(threw.message, /only https/);
});

await check("an unsupported scheme is still refused by the SSRF guard", async () => {
  const { assertPublicUrl } = await import("../lib/ssrf.js");
  await assert.rejects(() => assertPublicUrl("ftp://example.com/", { lookup: async () => [{ address: "93.184.216.34", family: 4 }] }), /only http/);
});

// ---------- proxy: a plain CONNECT tunnel for http targets ----------
await check("agentForUrl hands http targets a plain tunnel agent and keeps it per proxy", async () => {
  const cache = new Map();
  const settings = { http: "http://p:1", https: "http://p:1", noProxy: "" };
  const httpAgent = agentForUrl("http://a.com/", { settings, cache });
  const httpsAgent = agentForUrl("https://a.com/", { settings, cache });
  assert.ok(httpAgent instanceof HttpTunnelAgent);
  assert.ok(httpsAgent instanceof TunnelAgent);
  assert.equal(agentForUrl("http://b.com/", { settings, cache }), httpAgent);
  assert.equal(cache.size, 2);
});

await check("an http page is fetched through the CONNECT tunnel", async () => {
  const tunnels = [];
  await withServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(BODY);
  }, async ({ port: originPort }) => {
    const proxy = http.createServer((req, res) => {
      res.writeHead(405);
      res.end();
    });
    proxy.on("connect", (req, clientSocket, head) => {
      tunnels.push(req.url);
      const [host, port] = String(req.url).split(":");
      const upstream = net.connect(Number(port), host, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head?.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => upstream.destroy());
    });
    await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    try {
      const agent = new HttpTunnelAgent(`http://127.0.0.1:${proxy.address().port}`);
      const result = await httpsGetFollow(`http://127.0.0.1:${originPort}/tunnelled`, { timeoutMs: 3000, agent });
      assert.equal(result.status, 200);
      assert.ok(result.text.includes("http-body"));
      assert.deepEqual(tunnels, [`127.0.0.1:${originPort}`]);
    } finally {
      proxy.closeAllConnections?.();
      await new Promise((resolve) => proxy.close(resolve));
    }
  });
});

console.log("");
console.log(`OK: ${checks} fetch-http checks passed`);
