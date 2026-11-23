// #155: search-engine requests can use their own proxy.
//
// `proxyFetch` either delegates to the platform fetch (no proxy configured) or
// opens an http / https / socks5 tunnel itself. SOCKS5 lives in this repo
// because Node has no built-in SOCKS client.
//
// The tunnel behaviour is proven in tools/assert-proxy-tunnel.mjs (local
// CONNECT proxy, local SOCKS5 server, real sockets). This file covers parsing,
// selection rules and wiring.
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseProxy, resolveProxy, setActiveSearchProxy, getActiveSearchProxy } from "../lib/proxy_fetch.js";

const root = new URL("..", import.meta.url);
const proxySource = fs.readFileSync(new URL("lib/proxy_fetch.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("http, https and socks5 addresses parse", () => {
  const http = parseProxy("http://1.2.3.4:8080");
  assert.equal(http.kind, "http");
  assert.equal(http.port, 8080);
  const https = parseProxy("https://1.2.3.4:8443");
  assert.equal(https.kind, "https");
  assert.equal(https.port, 8443);
  const socks = parseProxy("socks5://1.2.3.4:1080");
  assert.equal(socks.kind, "socks5");
  assert.equal(socks.port, 1080);
});

check("credentials survive parsing", () => {
  const p = parseProxy("socks5://user:p%40ss@1.2.3.4:1080");
  assert.equal(p.username, "user");
  assert.equal(p.password, "p@ss", "percent-encoded credentials must be decoded");
});

check("a scheme-less address is treated as http", () => {
  const p = parseProxy("1.2.3.4:8080");
  assert.equal(p.kind, "http");
  assert.equal(p.host, "1.2.3.4");
});

check("socks5h asks the proxy to resolve the hostname", () => {
  assert.equal(parseProxy("socks5h://1.2.3.4:1080").remoteResolve, true);
  assert.equal(parseProxy("socks5://1.2.3.4:1080").remoteResolve, true);
});

check("unsupported schemes are rejected rather than silently ignored", () => {
  assert.equal(parseProxy("ftp://1.2.3.4:21"), null);
  assert.equal(parseProxy("http://"), null);
  assert.equal(parseProxy(""), null);
});

check("no_proxy wins over an explicit setting", () => {
  const result = resolveProxy("https://127.0.0.1:8080/x", {
    searchProxy: "http://1.2.3.4:8080",
    env: { NO_PROXY: "127.0.0.1" },
  });
  assert.equal(result.proxy, null);
  assert.equal(result.source, "no_proxy");
});

check("an explicit setting is used for other hosts", () => {
  const result = resolveProxy("https://example.com/x", {
    searchProxy: "socks5://1.2.3.4:1080",
    env: { NO_PROXY: "127.0.0.1" },
  });
  assert.equal(result.proxy.kind, "socks5");
  assert.equal(result.source, "setting");
});

check("an empty setting means direct, not env", () => {
  const result = resolveProxy("https://example.com/x", {
    searchProxy: "",
    env: { HTTPS_PROXY: "http://1.2.3.4:8080" },
  });
  // The platform fetch handles env proxies itself (Node 24+ NODE_USE_ENV_PROXY),
  // so this module must not double-handle them.
  assert.equal(result.proxy, null);
  assert.equal(result.source, "direct");
});

check("the active proxy is module state the config layer sets", () => {
  setActiveSearchProxy("socks5://1.2.3.4:1080");
  assert.equal(getActiveSearchProxy(), "socks5://1.2.3.4:1080");
  setActiveSearchProxy("");
  assert.equal(getActiveSearchProxy(), "");
});

check("no search module still calls the bare global fetch", () => {
  // 只圈定搜索路径：引擎、SERP、平台检索。天气与更新检查本来就走平台 fetch。
  const allowed = ["serp_engines.js", "platform_engines.js"];
  const offenders = [];
  const inspect = (relative, text) => {
    // 排除方法定义（`async fetch(request, signal)`）：那是 seam 的方法名，不是调用。
    const calls = text.replace(/async\s+fetch\(/g, "ASYNC_METHOD(");
    if (/(?<![\w.$])fetch\(/.test(calls)) offenders.push(relative);
  };
  for (const name of fs.readdirSync(new URL("lib/engines", root))) {
    if (!name.endsWith(".js")) continue;
    inspect(`lib/engines/${name}`, fs.readFileSync(new URL(`lib/engines/${name}`, root), "utf8"));
  }
  for (const name of allowed) {
    inspect(`lib/${name}`, fs.readFileSync(new URL(`lib/${name}`, root), "utf8"));
  }
  assert.deepEqual(offenders, [], `still calling the bare fetch: ${offenders.join(", ")}`);
});

check("the setting only governs search engines", () => {
  // 抓取层有自己的 env-proxy 隧道（lib/proxy.js），天气与更新检查不属于搜索：
  // 它们保持平台 fetch，不能被这个设置顺手接管。
  for (const file of ["lib/weather.js", "lib/fetch_provider.js", "lib/fetch_upstream.js", "lib/research.js"]) {
    const text = fs.readFileSync(new URL(file, root), "utf8");
    assert.doesNotMatch(text, /from "\/\.\/proxy_fetch\.js"|from "\/\.\.\/proxy_fetch\.js"/, `${file} must not use the search proxy`);
  }
  const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
  assert.match(index, /await fetch\(NPM_REGISTRY_URL/, "the update check stays on the platform fetch");
});

check("the config key and the settings field exist", () => {
  const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
  const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
  assert.match(index, /searchProxy: z\.string\(\)\.default\(""\)\.volatile\(\)/);
  assert.match(index, /setActiveSearchProxy\(cfg\.searchProxy\)/);
  assert.match(client, /const \[searchProxy, setSearchProxy\] = react\.useState\(""\)/);
  assert.match(client, /path: \["searchProxy"\], value: String\(searchProxy \?\? ""\)\.trim\(\)/);
});

check("the setting is described as search-only, in both languages", () => {
  const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
  assert.match(client, /searchProxyLabel: "搜索代理"/);
  assert.match(client, /searchProxyHint: "只用于搜索引擎的请求/);
  assert.match(client, /searchProxyLabel: "Search proxy"/);
  assert.match(client, /searchProxyHint: "Search-engine requests only/);
  // 卡片里必须说明支持哪几种代理——用户不该靠猜地址写法。
  assert.match(client, /searchProxyHint: "[^"]*http \/ https[^"]*socks5[^"]*/, "the hint names the supported schemes");
  assert.match(client, /searchProxyHint: "Search-engine requests only[^"]*socks5[^"]*/, "the en hint names socks5 too");
  // 长说明进悬停卡片，不再另起一行占版面。
  const at = client.indexOf("t.searchProxyLabel");
  const before = client.slice(Math.max(0, at - 260), at);
  assert.match(before, /HintCard, \{/, "the label lives inside the hover card");
});

check("SOCKS5 is implemented here, not assumed from a dependency", () => {
  assert.match(proxySource, /function socks5Connect/);
  // version negotiation, optional auth, CONNECT reply parsing
  assert.match(proxySource, /0x05, methods\.length/);
  assert.match(proxySource, /0x01, user\.length/);
  assert.match(proxySource, /0x05, 0x01, 0x00, 0x03, hostBuf\.length/);
});

check("redirect handling follows fetch semantics", () => {
  // 引擎用到 follow（静默跟随）、manual（只取 Location）、error（拒绝跳转）三档。
  assert.match(proxySource, /redirectMode === "manual"/);
  assert.match(proxySource, /redirectMode === "error"/);
  assert.match(proxySource, /response\.status === 303/);
});

check("the HTTP/1.1 write goes through our own tunnel socket", () => {
  // 回归：https.request 与 `agent: false` 都会忽略 createConnection，另开一条
  // 直连去目标——代理被静默绕过，表现为超时或「明文 HTTP 发到 HTTPS 端口」。
  assert.match(proxySource, /agent\.createConnection = \(\) => socket/, "the one-shot agent must hand back the tunnel socket");
  assert.doesNotMatch(proxySource, /agent: false,\s*\n\s*createConnection/, "agent: false discards createConnection");
  assert.doesNotMatch(proxySource, /const transport = secure \? https : http/, "https.request ignores a socket we already TLS-wrapped");
  const write = proxySource.slice(proxySource.indexOf("const request = http.request({"));
  assert.match(write.slice(0, 400), /agent,/, "the request must carry the one-shot agent");
});

check("abort and timeout keep the native error names", () => {
  // 多个引擎按 error.name 分支区分「超时」与「取消」的文案。
  assert.match(proxySource, /name = "AbortError"/);
  assert.match(proxySource, /name = "TimeoutError"/);
});

check("the package stays dependency-free", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
  assert.deepEqual(pkg.dependencies ?? {}, {}, "proxy support must not add a dependency");
});

console.log(`OK: ${checks} search proxy checks passed`);
