// #155: the proxy tunnel itself, proven against real sockets.
//
// Spins up a local CONNECT proxy and a local SOCKS5 server (both hand-written,
// no dependencies), points `proxyFetch` at them, and checks the wire behaviour:
// method/body/headers survive, redirects are followed per `redirect` mode,
// credentials are decoded, gzip is decompressed, tunnels are reused once and
// closed, and failures are explicit. Fully offline.
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import zlib from "node:zlib";
import { proxyFetch } from "../lib/proxy_fetch.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

// A machine-wide NO_PROXY=localhost,127.0.0.1 would bypass every local target
// and make these assertions vacuous.
delete process.env.NO_PROXY;
delete process.env.no_proxy;

const closer = [];
// `server.closeAllConnections()` does NOT reach sockets upgraded by CONNECT —
// Node detaches them from the server's connection list. A proxy that only
// answers CONNECT therefore keeps `server.close()` pending forever. Track them
// ourselves and destroy them before closing.
const tunnelSockets = new Set();
const trackTunnels = (server) => {
  server.on("connect", (req, socket) => {
    tunnelSockets.add(socket);
    socket.once("close", () => tunnelSockets.delete(socket));
  });
};
const closeServer = async (server) => {
  for (const socket of tunnelSockets) socket.destroy();
  server.closeAllConnections?.();
  await Promise.race([
    new Promise((resolve) => server.close(resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
};
const closeAll = async () => {
  for (const item of closer) await closeServer(item);
};

const listen = async (server) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  trackTunnels(server);
  closer.push(server);
  return server.address().port;
};

// ---------- a target that echoes what it received ----------
const target = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ method: req.method, url: req.url, body, host: req.headers.host }));
  });
});
const targetPort = await listen(target);

// ---------- a CONNECT proxy ----------
const proxyAuth = [];
let tunnelsOpened = 0;
const proxy = http.createServer((req, res) => res.writeHead(405).end());
proxy.on("connect", (req, clientSocket, head) => {
  tunnelsOpened += 1;
  proxyAuth.push(req.headers["proxy-authorization"]);
  const [host, port] = req.url.split(":");
  const upstream = net.connect({ host, port: Number(port) }, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head?.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("close", () => upstream.destroy());
});
const proxyPort = await listen(proxy);
const proxyFor = (extra = {}) => ({ kind: "http", host: "127.0.0.1", port: proxyPort, ...extra });

await check("a request through the tunnel keeps method, path, body and host", async () => {
  const r = await proxyFetch(`http://127.0.0.1:${targetPort}/path?q=1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hello: "world" }),
    proxy: proxyFor(),
  });
  assert.equal(r.status, 200);
  const echo = await r.json();
  assert.equal(echo.method, "POST");
  assert.equal(echo.url, "/path?q=1");
  assert.equal(echo.body, '{"hello":"world"}');
  assert.match(echo.host, /127\.0\.0\.1/);
});

await check("proxy credentials are percent-decoded into a Basic header", async () => {
  await proxyFetch(`http://127.0.0.1:${targetPort}/auth`, {
    proxy: proxyFor({ username: "user", password: "p@ss" }),
  });
  const expected = "Basic " + Buffer.from("user:p@ss").toString("base64");
  assert.equal(proxyAuth.at(-1), expected);
});

await check("each request gets its own tunnel", async () => {
  const before = tunnelsOpened;
  await proxyFetch(`http://127.0.0.1:${targetPort}/a`, { proxy: proxyFor() });
  await proxyFetch(`http://127.0.0.1:${targetPort}/b`, { proxy: proxyFor() });
  assert.equal(tunnelsOpened - before, 2);
});

await check("the tunnel socket is closed after the response", async () => {
  let open = 0;
  const counting = http.createServer((req, res) => res.writeHead(405).end());
  counting.on("connect", (req, socket) => {
    open += 1;
    socket.on("close", () => (open -= 1));
    const [host, port] = req.url.split(":");
    const upstream = net.connect({ host, port: Number(port) }, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
  });
  const port = await listen(counting);
  await proxyFetch(`http://127.0.0.1:${targetPort}/leak`, { proxy: { kind: "http", host: "127.0.0.1", port } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(open, 0, "a finished request must not leave the tunnel open");
  await closeServer(counting);
});

await check("a proxy that accepts CONNECT then dies does not fall back to a direct connection", async () => {
  // 回归（#155）：早期实现用 `agent: false` / `https.request`，两者都会忽略
  // createConnection 另开一条直连。结果代理坏掉时请求反而成功，用户以为走了代理。
  const dying = http.createServer((req, res) => res.writeHead(405).end());
  dying.on("connect", (req, socket) => {
    socket.end("HTTP/1.1 200 Connection Established\r\n\r\n");
  });
  const port = await listen(dying);
  await assert.rejects(
    () => proxyFetch(`http://127.0.0.1:${targetPort}/bypass`, {
      proxy: { kind: "http", host: "127.0.0.1", port },
      timeoutMs: 5000,
    }),
    // 目标本身完全可用，所以只有「真的走了这条隧道」才会失败。
    /ECONNRESET|socket hang up|closed/i,
    "a broken tunnel must surface as an error, not a silent direct fetch"
  );
  await closeServer(dying);
});

// ---------- redirect handling ----------
const hops = http.createServer((req, res) => {
  if (req.url.startsWith("/from")) {
    res.writeHead(302, { location: "/to?x=1" }).end();
    return;
  }
  res.end(JSON.stringify({ landed: req.url, method: req.method }));
});
const hopPort = await listen(hops);

await check("redirect: follow lands on the new location", async () => {
  const r = await proxyFetch(`http://127.0.0.1:${hopPort}/from`, { proxy: proxyFor() });
  const landed = await r.json();
  assert.equal(landed.landed, "/to?x=1");
  assert.equal(r.url, `http://127.0.0.1:${hopPort}/to?x=1`, "the final url is reported");
});

await check("303 turns a POST into a bodyless GET", async () => {
  const r = await proxyFetch(`http://127.0.0.1:${hopPort}/from`, {
    method: "POST",
    body: "payload",
    headers: { "content-type": "text/plain" },
    proxy: proxyFor(),
  });
  const landed = await r.json();
  assert.equal(landed.method, "GET");
});

await check("redirect: error throws a TypeError like the platform", async () => {
  await assert.rejects(
    () => proxyFetch(`http://127.0.0.1:${hopPort}/from`, { proxy: proxyFor(), redirect: "error" }),
    (error) => error instanceof TypeError && /unexpected redirect/.test(error.message)
  );
});

await check("redirect: manual exposes the status and Location", async () => {
  const r = await proxyFetch(`http://127.0.0.1:${hopPort}/from`, { proxy: proxyFor(), redirect: "manual" });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/to?x=1");
  await r.body.cancel();
});

// ---------- transport details ----------
await check("a gzip response body is decompressed", async () => {
  const gz = http.createServer((req, res) => {
    res.writeHead(200, { "content-encoding": "gzip", "content-type": "application/json" });
    res.end(zlib.gzipSync(JSON.stringify({ ok: true })));
  });
  const port = await listen(gz);
  const r = await proxyFetch(`http://127.0.0.1:${port}/gz`, { proxy: proxyFor() });
  assert.deepEqual(await r.json(), { ok: true });
  await closeServer(gz);
});

await check("a proxy that refuses CONNECT reports the status", async () => {
  const refusing = http.createServer((req, res) => res.writeHead(405).end());
  refusing.on("connect", (req, socket) => socket.end("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n"));
  const port = await listen(refusing);
  await assert.rejects(
    () => proxyFetch(`http://127.0.0.1:${targetPort}/x`, { proxy: { kind: "http", host: "127.0.0.1", port } }),
    /refused CONNECT \(HTTP 407\)/
  );
  await closeServer(refusing);
});

await check("an unreachable proxy fails fast", async () => {
  await assert.rejects(
    () => proxyFetch(`http://127.0.0.1:${targetPort}/x`, { proxy: { kind: "http", host: "127.0.0.1", port: 1 }, timeoutMs: 3000 }),
    /ECONNREFUSED|timed out/
  );
});

await check("no_proxy bypasses the tunnel for a matching host", async () => {
  const before = tunnelsOpened;
  process.env.NO_PROXY = "127.0.0.1";
  try {
    const r = await proxyFetch(`http://127.0.0.1:${targetPort}/direct`, { proxy: proxyFor() });
    assert.equal(r.status, 200);
    assert.equal(tunnelsOpened, before, "no tunnel should be opened");
  } finally {
    delete process.env.NO_PROXY;
  }
});

// ---------- SOCKS5 ----------
/** Minimal SOCKS5 server: version negotiation, optional user/pass auth, CONNECT. */
function socks5({ user = "u", pass = "p", requireAuth = false } = {}) {
  const seen = { methods: [], auth: null, target: null };
  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    let stage = "greeting";
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === "greeting") {
        if (buf.length < 2 || buf.length < 2 + buf[1]) return;
        const count = buf[1];
        seen.methods = [...buf.subarray(2, 2 + count)];
        buf = buf.subarray(2 + count);
        if (requireAuth) {
          if (!seen.methods.includes(0x02)) return socket.end(Buffer.from([0x05, 0xff]));
          socket.write(Buffer.from([0x05, 0x02]));
          stage = "auth";
        } else {
          socket.write(Buffer.from([0x05, 0x00]));
          stage = "request";
        }
        return;
      }
      if (stage === "auth") {
        if (buf.length < 2) return;
        const ulen = buf[1];
        if (buf.length < 3 + ulen) return;
        const plen = buf[2 + ulen];
        if (buf.length < 3 + ulen + plen) return;
        seen.auth = {
          user: buf.subarray(2, 2 + ulen).toString(),
          pass: buf.subarray(3 + ulen, 3 + ulen + plen).toString(),
        };
        buf = buf.subarray(3 + ulen + plen);
        const authOk = seen.auth.user === user && seen.auth.pass === pass;
        socket.write(Buffer.from([0x01, authOk ? 0x00 : 0x01]));
        if (!authOk) return socket.end();
        stage = "request";
        return;
      }
      if (stage === "request") {
        if (buf.length < 4 || buf[3] !== 0x03) return;
        const hostLen = buf[4];
        if (buf.length < 5 + hostLen + 2) return;
        const host = buf.subarray(5, 5 + hostLen).toString();
        const port = buf.readUInt16BE(5 + hostLen);
        seen.target = `${host}:${port}`;
        const upstream = net.connect({ host, port }, () => {
          socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
          upstream.pipe(socket);
          socket.pipe(upstream);
        });
        upstream.on("error", () => socket.end(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0])));
        stage = "tunnel";
      }
    });
  });
  return { server, seen };
}

await check("socks5 without auth reaches the target", async () => {
  const plain = socks5();
  const port = await listen(plain.server);
  const r = await proxyFetch(`http://127.0.0.1:${targetPort}/one`, {
    proxy: { kind: "socks5", host: "127.0.0.1", port, username: "", password: "" },
  });
  assert.equal((await r.json()).url, "/one");
  assert.deepEqual(plain.seen.methods, [0x00], "only the no-auth method is offered");
  assert.equal(plain.seen.target, `127.0.0.1:${targetPort}`, "CONNECT carries host:port");
});

await check("socks5 with username/password reaches the target", async () => {
  const authed = socks5({ requireAuth: true, user: "u", pass: "p" });
  const port = await listen(authed.server);
  const r = await proxyFetch(`http://127.0.0.1:${targetPort}/two`, {
    proxy: { kind: "socks5", host: "127.0.0.1", port, username: "u", password: "p" },
  });
  assert.equal((await r.json()).url, "/two");
  assert.deepEqual(authed.seen.auth, { user: "u", pass: "p" });
  assert.deepEqual(authed.seen.methods, [0x00, 0x02], "auth is offered alongside no-auth");
});

await check("socks5 authentication rejection is explicit", async () => {
  const strict = socks5({ requireAuth: true, user: "right", pass: "right" });
  const port = await listen(strict.server);
  await assert.rejects(
    () => proxyFetch(`http://127.0.0.1:${targetPort}/three`, {
      proxy: { kind: "socks5", host: "127.0.0.1", port, username: "wrong", password: "wrong" },
    }),
    /socks5: authentication rejected/
  );
});

await check("an unreachable socks5 proxy fails fast", async () => {
  await assert.rejects(
    () => proxyFetch(`http://127.0.0.1:${targetPort}/four`, {
      proxy: { kind: "socks5", host: "127.0.0.1", port: 1, username: "", password: "" },
      timeoutMs: 3000,
    }),
    /ECONNREFUSED|timed out/
  );
});

await closeAll();
console.log(`OK: ${checks} proxy tunnel checks passed`);
