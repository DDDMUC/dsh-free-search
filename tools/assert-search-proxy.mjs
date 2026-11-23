// #155: search-engine requests can use their own proxy.
//
// Engines call `proxyFetch`, which either delegates to the platform fetch
// (no proxy configured) or opens an http / https / socks5 tunnel itself.
// SOCKS5 is implemented in this repo because Node has no built-in SOCKS client.
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseProxy, resolveProxy, setActiveSearchProxy, getActiveSearchProxy } from "../lib/proxy_fetch.js";

const root = new URL("..", import.meta.url);

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
});

check("the active proxy is module state the config layer sets", () => {
  setActiveSearchProxy("socks5://1.2.3.4:1080");
  assert.equal(getActiveSearchProxy(), "socks5://1.2.3.4:1080");
  setActiveSearchProxy("");
  assert.equal(getActiveSearchProxy(), "");
});

check("no engine module still calls the bare global fetch", () => {
  const dirs = ["lib", "lib/engines"];
  const offenders = [];
  for (const dir of dirs) {
    for (const name of fs.readdirSync(new URL(dir, root))) {
      if (!name.endsWith(".js")) continue;
      if (["client.js", "proxy.js", "proxy_fetch.js"].includes(name)) continue;
      const text = fs.readFileSync(new URL(`${dir}/${name}`, root), "utf8");
      // 排除方法定义（`async fetch(request, signal)`）：那是 seam 的方法名，不是调用。
      const calls = text.replace(/async\s+fetch\(/g, "ASYNC_METHOD(");
      if (/(?<![\w.$])fetch\(/.test(calls)) offenders.push(`${dir}/${name}`);
    }
  }
  assert.deepEqual(offenders, [], `still calling the bare fetch: ${offenders.join(", ")}`);
});

check("the config key and the settings field exist", () => {
  const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
  const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
  assert.match(index, /searchProxy: z\.string\(\)\.default\(""\)\.volatile\(\)/);
  assert.match(index, /setActiveSearchProxy\(cfg\.searchProxy\)/);
  assert.match(client, /const \[searchProxy, setSearchProxy\] = react\.useState\(""\)/);
  assert.match(client, /path: \["searchProxy"\], value: String\(searchProxy \?\? ""\)\.trim\(\)/);
});

check("SOCKS5 is implemented here, not assumed from a dependency", () => {
  const source = fs.readFileSync(new URL("lib/proxy_fetch.js", root), "utf8");
  assert.match(source, /function socks5Connect/);
  // version negotiation, optional auth, CONNECT reply parsing
  assert.match(source, /0x05, methods\.length/);
  assert.match(source, /0x01, user\.length/);
  assert.match(source, /\[0x05, 0x01, 0x00, 0x03, hostBuf\.length/);
});

check("the package stays dependency-free", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
  assert.deepEqual(pkg.dependencies ?? {}, {}, "proxy support must not add a dependency");
});

console.log(`OK: ${checks} search proxy checks passed`);
