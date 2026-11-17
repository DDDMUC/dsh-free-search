// Proxy support for the local fetch layers: env parsing, no_proxy matching,
// per-target agent selection, and the CONNECT tunnel itself.
// Fully offline: a local http server plays the proxy and answers CONNECT with 502,
// so the assertions prove the request reached the proxy with the right authority
// without needing a real upstream or TLS handshake.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";

const { readProxyEnv, matchesNoProxy, proxyForTarget, agentForUrl, TunnelAgent, describeProxyEnv } = await import(
  "../lib/proxy.js"
);
const { httpsGetFollow } = await import("../lib/fetch_provider.js");

let checks = 0;
const checkAsync = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

// ---------- env parsing ----------
await checkAsync("lowercase wins over uppercase, empty string counts as unset", async () => {
  const s = readProxyEnv({ https_proxy: "http://127.0.0.1:8080", HTTPS_PROXY: "http://127.0.0.1:9999" });
  assert.equal(s.https, "http://127.0.0.1:8080");
  const t = readProxyEnv({ HTTPS_PROXY: "http://127.0.0.1:9999" });
  assert.equal(t.https, "http://127.0.0.1:9999");
  const u = readProxyEnv({ https_proxy: "", HTTPS_PROXY: "http://127.0.0.1:9999" });
  assert.equal(u.https, "http://127.0.0.1:9999");
});

await checkAsync("all_proxy is the fallback for both schemes", async () => {
  const s = readProxyEnv({ ALL_PROXY: "socks5://127.0.0.1:1080" });
  assert.equal(s.http, "socks5://127.0.0.1:1080");
  assert.equal(s.https, "socks5://127.0.0.1:1080");
});

await checkAsync("describeProxyEnv stays readable for logs", async () => {
  assert.equal(describeProxyEnv({}), "direct");
  assert.equal(describeProxyEnv({ HTTPS_PROXY: "http://p:1", NO_PROXY: "localhost" }), "https=http://p:1 no_proxy=localhost");
});

// ---------- no_proxy ----------
await checkAsync("no_proxy matches the host and its subdomains, not sibling names", async () => {
  assert.equal(matchesNoProxy("internal.example.com", ".internal.example.com"), true);
  assert.equal(matchesNoProxy("a.b.internal.example.com", "internal.example.com"), true);
  assert.equal(matchesNoProxy("notinternal.example.com", "internal.example.com"), false);
  assert.equal(matchesNoProxy("other.io", "localhost,127.0.0.1"), false);
});

await checkAsync("no_proxy honours a port suffix and the * wildcard", async () => {
  assert.equal(matchesNoProxy("example.com", "example.com:8080", "8080"), true);
  assert.equal(matchesNoProxy("example.com", "example.com:8080", "443"), false);
  assert.equal(matchesNoProxy("anything.io", "*"), true);
});

// ---------- per-target selection ----------
await checkAsync("loopback never goes through a proxy", async () => {
  const settings = { http: "http://127.0.0.1:8080", https: "http://127.0.0.1:8080", noProxy: "" };
  assert.equal(proxyForTarget("http://localhost:3000/", settings), "");
  assert.equal(proxyForTarget("https://127.0.0.1:8443/", settings), "");
  assert.equal(proxyForTarget("https://[::1]:8443/", settings), "");
});

await checkAsync("https targets use the https proxy, http targets the http proxy", async () => {
  const settings = { http: "http://h:1", https: "http://s:2", noProxy: "" };
  assert.match(proxyForTarget("https://a.com/", settings), /^http:\/\/s:2/);
  assert.match(proxyForTarget("http://a.com/", settings), /^http:\/\/h:1/);
});

await checkAsync("no_proxy and SOCKS are reported as direct", async () => {
  assert.equal(proxyForTarget("https://a.com/", { https: "http://p:1", noProxy: "a.com" }), "");
  assert.equal(proxyForTarget("https://a.com/", { https: "socks5://127.0.0.1:1080", noProxy: "" }), "");
  assert.equal(proxyForTarget("https://a.com/", { https: "", noProxy: "" }), "");
});

await checkAsync("agentForUrl reuses one agent per proxy and none without a proxy", async () => {
  const cache = new Map();
  const settings = { http: "http://p:1", https: "http://p:1", noProxy: "" };
  const first = agentForUrl("https://a.com/", { settings, cache });
  const second = agentForUrl("https://b.com/", { settings, cache });
  assert.ok(first instanceof TunnelAgent);
  assert.equal(first, second);
  assert.equal(cache.size, 1);
  assert.equal(agentForUrl("https://a.com/", { settings: { ...settings, https: "" }, cache: new Map() }), null);
});

// ---------- the tunnel itself ----------
const withProxy = async (handler, run) => {
  const seen = [];
  const server = http.createServer(handler);
  const tunnels = [];
  server.on("connect", (req, socket) => {
    seen.push({ url: req.url, auth: req.headers["proxy-authorization"] });
    tunnels.push(socket);
    handler(req, socket);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run({ port: server.address().port, seen });
  } finally {
    for (const socket of tunnels) socket.destroy();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
};

await checkAsync("the tunnel sends CONNECT <host>:<port> to the proxy", async () => {
  await withProxy(
    (req, socket) => {
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    },
    async ({ port, seen }) => {
      const agent = new TunnelAgent(`http://user:pass@127.0.0.1:${port}`);
      await assert.rejects(
        () => httpsGetFollow("https://example.com/a?b=1", { timeoutMs: 3000, agent }),
        /refused CONNECT example.com:443/
      );
      assert.deepEqual(seen.map((entry) => entry.url), ["example.com:443"]);
      assert.equal(seen[0].auth, `Basic ${Buffer.from("user:pass").toString("base64")}`);
      const provider = fs.readFileSync(new URL("../lib/fetch_provider.js", import.meta.url), "utf8");
      assert.match(provider, /--proxy-server=\$\{proxy\}/);
    }
  );
});

await checkAsync("a proxy that accepts the tunnel then dies still fails loudly", async () => {
  await withProxy(
    (req, socket) => {
      socket.end("HTTP/1.1 200 Connection Established\r\n\r\n");
    },
    async ({ port }) => {
      const agent = new TunnelAgent(`http://127.0.0.1:${port}`);
      await assert.rejects(
        () => httpsGetFollow("https://example.com/", { timeoutMs: 3000, agent }),
        /./ // any error: the TLS handshake cannot complete over a closed socket
      );
    }
  );
});

await checkAsync("a proxied request never hands the SSRF lookup to the transport", async () => {
  let sawOptions = null;
  const fakeTransport = {
    request(options) {
      sawOptions = options;
      throw new Error("stop here");
    },
  };
  // A proxied hop validates the host itself, then connects through the tunnel.
  const lookup = (hostname, options, callback) => callback(null, [{ address: "93.184.216.34", family: 4 }]);
  await assert.rejects(() => httpsGetFollow("https://example.com/", { timeoutMs: 1000, lookup, agent: {} }, fakeTransport));
  assert.ok(sawOptions, "transport.request must have been called");
  assert.equal(sawOptions.lookup, undefined, "the transport must resolve through the tunnel");
  assert.deepEqual(sawOptions.agent, {});
});

console.log(`OK: ${checks}`);
