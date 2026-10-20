// #87: a truncated compressed response must reject instead of hanging forever.
// No network: a local http server acts as the peer; httpsGetFollow accepts a transport for tests.
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";

const { httpsGetFollow } = await import("../lib/fetch_provider.js");

let checks = 0;
const checkAsync = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const startServer = async (handler) => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  return { server, url };
};

const stopServer = async (server) => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
};

const withDeadline = async (promise, ms, label) => {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ pending: true, label }), ms);
  });
  const outcome = await Promise.race([
    promise.then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error })
    ),
    deadline,
  ]);
  clearTimeout(timer);
  if (outcome.pending) assert.fail(`${label}: still pending after ${ms}ms`);
  return outcome;
};

const gz = zlib.gzipSync(Buffer.from("<html>" + "x".repeat(5000) + "</html>"));

await checkAsync("gzip response cut mid-body rejects (was: hung forever)", async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html", "Content-Encoding": "gzip" });
    res.write(gz.subarray(0, gz.length >> 1));
    setTimeout(() => res.destroy(), 100);
  });
  try {
    const outcome = await withDeadline(
      httpsGetFollow(url, { timeoutMs: 2000 }, http),
      4000,
      "gzip truncation"
    );
    assert.equal(outcome.ok, false, "must reject");
    assert.match(String(outcome.error.message), /abort|closed|error|unexpected/i);
  } finally {
    await stopServer(server);
  }
});

await checkAsync("identity response cut mid-body still rejects", async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.write("<html>" + "x".repeat(5000));
    setTimeout(() => res.destroy(), 100);
  });
  try {
    const outcome = await withDeadline(
      httpsGetFollow(url, { timeoutMs: 2000 }, http),
      4000,
      "identity truncation"
    );
    assert.equal(outcome.ok, false, "must reject");
  } finally {
    await stopServer(server);
  }
});

await checkAsync("abort rejects a stalled compressed body", async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html", "Content-Encoding": "gzip" });
    res.write(gz.subarray(0, gz.length >> 1));
    // never ends, never closes
  });
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("caller aborted")), 150);
    const outcome = await withDeadline(
      httpsGetFollow(url, { timeoutMs: 20000, signal: controller.signal }, http),
      3000,
      "abort while stalled"
    );
    assert.equal(outcome.ok, false, "must reject");
    assert.match(String(outcome.error.message), /aborted/i);
  } finally {
    await stopServer(server);
  }
});

await checkAsync("an already-aborted signal rejects immediately", async () => {
  const controller = new AbortController();
  controller.abort(new Error("too late"));
  const outcome = await withDeadline(
    httpsGetFollow("http://127.0.0.1:1/", { signal: controller.signal }, http),
    1000,
    "pre-aborted"
  );
  assert.equal(outcome.ok, false, "must reject");
  assert.match(String(outcome.error.message), /aborted/i);
});

await checkAsync("a complete gzip body still resolves", async () => {
  const { server, url } = await startServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html", "Content-Encoding": "gzip" });
    res.end(gz);
  });
  try {
    const outcome = await withDeadline(
      httpsGetFollow(url, { timeoutMs: 2000 }, http),
      4000,
      "complete gzip"
    );
    assert.equal(outcome.ok, true, "must resolve");
    assert.match(outcome.value.text, /<html>/);
    assert.equal(outcome.value.status, 200);
  } finally {
    await stopServer(server);
  }
});

await checkAsync("redirects are followed to the final URL", async () => {
  let base = "";
  const { server } = await startServer((req, res) => {
    if (req.url === "/start") {
      res.writeHead(302, { Location: `${base}/final` });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("landed");
  });
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    const outcome = await withDeadline(
      httpsGetFollow(`${base}/start`, { timeoutMs: 2000 }, http),
      4000,
      "redirect"
    );
    assert.equal(outcome.ok, true, "must resolve");
    assert.equal(outcome.value.url, `${base}/final`);
    assert.equal(outcome.value.text, "landed");
  } finally {
    await stopServer(server);
  }
});

console.log(`OK: ${checks} fetch abort checks passed`);
