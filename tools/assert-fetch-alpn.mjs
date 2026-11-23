// #162: a TLS handshake without ALPN is RST by some WAFs, so every https hop
// must advertise http/1.1 (and only http/1.1 — the response parser is HTTP/1.1).
//
// Offline: the injected transport captures the options passed to request().
import assert from "node:assert/strict";
import fs from "node:fs";
import { httpsGetFollow, browserishHeaders } from "../lib/fetch_provider.js";

const root = new URL("..", import.meta.url);
const source = fs.readFileSync(new URL("lib/fetch_provider.js", root), "utf8");

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

/** Captures every request() call and then fires the caller's own timeout. */
const capture = () => {
  const seen = [];
  const transport = {
    request(options) {
      seen.push(options);
      const handlers = {};
      const req = {
        destroyed: false,
        on(event, fn) { handlers[event] = fn; return req; },
        once(event, fn) { handlers[event] = fn; return req; },
        setTimeout() { return req; },
        destroy(error) {
          req.destroyed = true;
          if (error) setTimeout(() => handlers.error?.(error), 0);
          return req;
        },
        // 走完一点延迟再报 timeout，让调用方自己的监听先挂上。
        end() { setTimeout(() => handlers.timeout?.(), 60); return req; },
      };
      return req;
    },
  };
  return { seen, transport };
};

await check("an https hop advertises ALPN http/1.1", async () => {
  const { seen, transport } = capture();
  await httpsGetFollow("https://example.com/a?b=1", { timeoutMs: 250 }, transport).catch(() => undefined);
  assert.equal(seen.length, 1, "one request must have been issued");
  assert.deepEqual(seen[0].ALPNProtocols, ["http/1.1"]);
});

await check("ALPN is not advertised as h2", async () => {
  const { seen, transport } = capture();
  await httpsGetFollow("https://example.com/", { timeoutMs: 250 }, transport).catch(() => undefined);
  assert.equal(seen[0].ALPNProtocols.length, 1, "the parser is HTTP/1.1; h2 would be read wrongly");
});

await check("an http hop does not advertise ALPN", async () => {
  const { seen, transport } = capture();
  await httpsGetFollow("http://example.com/", { timeoutMs: 250 }, transport).catch(() => undefined);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].ALPNProtocols, undefined, "http.request ignores it, and mixing it in blurs intent");
});

await check("the ALPN decision follows the redirect target's protocol", () => {
  // 逐跳判断：选项里用的是 target.protocol，而不是入口 URL 的协议。
  const at = source.indexOf("ALPNProtocols");
  assert.ok(at > 0);
  const before = source.slice(at - 260, at);
  assert.match(before, /target\.protocol === "https:"/, "ALPN must be decided per hop");
});

await check("a skipped browser tier still explains itself", async () => {
  // #162 附带项：browser 层静默跳过时，errors 里要能看到原因。
  assert.match(source, /browser: disabled in settings/);
  assert.match(source, /browser: no system browser found/);
  assert.match(source, /browser: configured path not found/);
});

await check("both HTML return points slim the body before the host truncates it", async () => {
  // #161 与这里共用同一次改动：HTML 结果必须先瘦身。
  // 直接点击与浏览器层都必须调用 slimHtml（或复用已算好的 slim 变量）。
  assert.match(source, /content: stripLoneSurrogates\(slimHtml\(r\.text\)\)/, "the direct tier slims before returning");
  assert.match(source, /content: stripLoneSurrogates\(slimHtml\(html\)\)/, "the browser tier slims too");
  // 层的走留仍按原始长度：瘦身后的长度不是"这一层有没有拿到页面"的判据。
  assert.match(source, /r\.text\.length >= T1_MIN_CHARS/, "the tier gate keeps using the raw length");
});

await check("browserishHeaders still carries the browser identity", async () => {
  const headers = browserishHeaders("en-US");
  assert.match(headers["User-Agent"], /Chrome|Firefox|Safari/);
  assert.equal(headers["Accept-Language"], "en-US");
  assert.match(headers.Accept, /text\/html/);
});

console.log(`OK: ${checks} ALPN checks passed`);
