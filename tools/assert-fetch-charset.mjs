// #88: T1 direct fetch must decode by the declared charset (GBK/GB2312/…), not always UTF-8.
// No network: a local http server supplies the bytes; httpsGetFollow accepts a transport for tests.
import assert from "node:assert/strict";
import http from "node:http";

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
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
};

const stopServer = async (server) => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
};

const withServer = async (handler, run) => {
  const { server, url } = await startServer(handler);
  try {
    return await run(url);
  } finally {
    await stopServer(server);
  }
};

const GBK_NIHAO = Buffer.from([0xc4, 0xe3, 0xba, 0xc3]); // 你好

await checkAsync("decodes GBK when Content-Type declares charset=gbk", async () => {
  const text = await withServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=gbk" });
      res.end(Buffer.concat([Buffer.from("<html><body>"), GBK_NIHAO, Buffer.from("</body></html>")]));
    },
    async (url) => (await httpsGetFollow(url, { timeoutMs: 2000 }, http)).text
  );
  assert.match(text, /你好/);
  assert.doesNotMatch(text, /\uFFFD/);
});

await checkAsync("decodes GB2312 alias", async () => {
  const text = await withServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=gb2312" });
      res.end(Buffer.concat([Buffer.from("<p>"), GBK_NIHAO, Buffer.from("</p>")]));
    },
    async (url) => (await httpsGetFollow(url, { timeoutMs: 2000 }, http)).text
  );
  assert.match(text, /你好/);
});

await checkAsync("sniffs <meta charset> when the header has none", async () => {
  const text = await withServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        Buffer.concat([
          Buffer.from('<html><head><meta charset="gbk"></head><body>'),
          GBK_NIHAO,
          Buffer.from("</body></html>"),
        ])
      );
    },
    async (url) => (await httpsGetFollow(url, { timeoutMs: 2000 }, http)).text
  );
  assert.match(text, /你好/);
});

await checkAsync("sniffs the http-equiv content-type form as well", async () => {
  const text = await withServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        Buffer.concat([
          Buffer.from('<html><head><meta http-equiv="content-type" content="text/html; charset=gbk"></head><body>'),
          GBK_NIHAO,
          Buffer.from("</body></html>"),
        ])
      );
    },
    async (url) => (await httpsGetFollow(url, { timeoutMs: 2000 }, http)).text
  );
  assert.match(text, /你好/);
});

await checkAsync("UTF-8 stays UTF-8 when nothing is declared", async () => {
  const text = await withServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>你好</body></html>");
    },
    async (url) => (await httpsGetFollow(url, { timeoutMs: 2000 }, http)).text
  );
  assert.match(text, /你好/);
});

await checkAsync("an unknown charset label falls back to UTF-8 instead of throwing", async () => {
  const text = await withServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain; charset=x-nonsense" });
      res.end("plain ascii body");
    },
    async (url) => (await httpsGetFollow(url, { timeoutMs: 2000 }, http)).text
  );
  assert.equal(text, "plain ascii body");
});

console.log(`OK: ${checks} fetch charset checks passed`);
