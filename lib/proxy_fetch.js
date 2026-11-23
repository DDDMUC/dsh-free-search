// 搜索侧的代理出口。
//
// 引擎用的是全局 `fetch`，它走 undici 的内部 dispatcher，看不到本插件的
// CONNECT 隧道，也不接受自定义 agent —— 所以「搜索走代理」不能靠改 fetch 的参数，
// 必须自己发请求。
//
// 这个模块提供一个与 `fetch` 同形的函数：`proxyFetch(url, init)`。
// 它支持三种代理：http、https、socks5（含用户名密码），解析顺序是
// 「显式设置 > 环境变量 > 直连」，并且尊重 `no_proxy`。
//
// 与 lib/proxy.js 的关系：那边的 `openTunnel` 只服务 node:https 的抓取链，
// 这里额外实现了 SOCKS5 握手（Node 原生不支持 SOCKS），两者共享 no_proxy 判定。
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { readProxyEnv } from "./proxy.js";

/** 每次请求的状态；返回一个 fetch 形状的对象（ok/status/headers/text/json）。 */
class ProxyResponse {
  constructor(status, headers, body) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.headers = new HeadersView(headers);
    this._body = body;
  }
  async text() { return this._body; }
  async json() { return JSON.parse(this._body); }
}

class HeadersView {
  constructor(raw) {
    this._raw = raw ?? {};
  }
  get(name) {
    const key = String(name).toLowerCase();
    for (const [k, v] of Object.entries(this._raw)) {
      if (k.toLowerCase() === key) return Array.isArray(v) ? v.join(", ") : v;
    }
    return null;
  }
}

const bareHost = (h) => String(h ?? "").toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");

/**
 * 当前生效的搜索代理。
 *
 * 由配置层在每次搜索前写入（与 blockedDomains / Accept-Language 同样的
 * 模块级活动值模式），这样 40 多个引擎不必各自接收一个参数。
 * 空字符串 = 未配置，回退到环境变量。
 */
let activeSearchProxy = "";

/** 设置本进程当前使用的搜索代理；空值表示跟随环境变量。 */
export function setActiveSearchProxy(value) {
  activeSearchProxy = typeof value === "string" ? value.trim() : "";
}

/** 读取当前生效的搜索代理（测试与诊断用）。 */
export function getActiveSearchProxy() {
  return activeSearchProxy;
}

/** 解析一段代理字符串；不合法返回 null。支持 scheme 省略（按 http 处理）。 */
export function parseProxy(raw) {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  let url;
  try {
    url = new URL(text.includes("://") ? text : "http://" + text);
  } catch {
    return null;
  }
  const protocol = url.protocol;
  if (!["http:", "https:", "socks5:", "socks5h:", "socks:"].includes(protocol)) return null;
  const kind = protocol.startsWith("socks") ? "socks5" : protocol === "https:" ? "https" : "http";
  return {
    kind,
    host: url.hostname,
    port: Number(url.port) || (kind === "socks5" ? 1080 : kind === "https" ? 443 : 80),
    username: url.username === "" ? "" : decodeURIComponent(url.username),
    password: url.password === "" ? "" : decodeURIComponent(url.password),
    // socks5h 与 socks5 都把域名交给代理解析：本实现不做本地 DNS，
    // 保证与上游的 no_proxy / SSRF 判定使用同一份主机名。
    remoteResolve: kind === "socks5",
  };
}

/**
 * 决定这次请求走哪个代理。
 * @param targetUrl 目标地址
 * @param settings.searchProxy 设置页里填的代理（空 = 不启用这条）
 * @param env 环境变量（未设置 searchProxy 时回退到它）
 */
export function resolveProxy(targetUrl, { searchProxy = "", env = process.env } = {}) {
  const explicit = parseProxy(searchProxy);
  if (explicit) {
    // 显式设置优先，但 no_proxy 依然生效：用户列了直连的域名不该被代理。
    const envSettings = readProxyEnv(env);
    const target = new URL(String(targetUrl));
    const host = bareHost(target.hostname);
    if (isNoProxy(host, target.port || (target.protocol === "https:" ? "443" : "80"), envSettings.noProxy)) {
      return { proxy: null, source: "no_proxy" };
    }
    return { proxy: explicit, source: "setting" };
  }
  // 未显式配置时返回 direct：环境变量代理交给平台 fetch 自己处理
  // （Node 24+ 的 NODE_USE_ENV_PROXY），这里不重复接管，避免改变既有行为。
  return { proxy: null, source: "direct" };
}

function isNoProxy(host, port, noProxy) {
  const rules = String(noProxy ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  for (const rule of rules) {
    const lower = rule.toLowerCase().replace(/^\*?\./, "");
    if (lower === "*") return true;
    const [entryHost, entryPort] = lower.split(":");
    if (entryPort && entryPort !== String(port)) continue;
    if (host === entryHost || host.endsWith("." + entryHost) || (entryHost.startsWith(".") && host.endsWith(entryHost))) {
      return true;
    }
  }
  return false;
}

/** SOCKS5 握手：版本协商 → 可选用户名密码认证 → CONNECT 到目标。 */
function socks5Connect(proxy, targetHost, targetPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port });
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const timer = setTimeout(() => fail(new Error(`socks5 ${proxy.host}:${proxy.port} handshake timed out`)), timeoutMs);
    timer.unref?.();
    socket.once("error", (e) => fail(new Error(`socks5 ${proxy.host}: ${e.message}`)));

    let stage = "greeting";
    let buffer = Buffer.alloc(0);

    const write = (buf) => socket.write(buf);

    socket.on("connect", () => {
      const methods = proxy.username || proxy.password ? [0x00, 0x02] : [0x00];
      write(Buffer.from([0x05, methods.length, ...methods]));
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        if (stage === "greeting") {
          if (buffer.length < 2) return;
          const method = buffer[1];
          buffer = buffer.subarray(2);
          if (method === 0xff) return fail(new Error("socks5: no acceptable auth method"));
          if (method === 0x02) {
            stage = "auth";
            const user = Buffer.from(proxy.username);
            const pass = Buffer.from(proxy.password);
            write(Buffer.from([0x01, user.length, ...user, pass.length, ...pass]));
            return;
          }
          stage = "connect";
          sendConnect();
          return;
        }
        if (stage === "auth") {
          if (buffer.length < 2) return;
          const status = buffer[1];
          buffer = buffer.subarray(2);
          if (status !== 0x00) return fail(new Error("socks5: authentication rejected"));
          stage = "connect";
          sendConnect();
          return;
        }
        if (stage === "reply") {
          if (buffer.length < 4) return;
          const rep = buffer[1];
          if (rep !== 0x00) {
            const reasons = {
              1: "general failure", 2: "not allowed", 3: "network unreachable",
              4: "host unreachable", 5: "connection refused", 6: "TTL expired",
              7: "command not supported", 8: "address type not supported",
            };
            return fail(new Error(`socks5: ${reasons[rep] ?? "error " + rep}`));
          }
          const atyp = buffer[3];
          const addrLen = atyp === 0x01 ? 4 : atyp === 0x03 ? 1 + buffer[4] : atyp === 0x04 ? 16 : -1;
          if (addrLen < 0) return fail(new Error("socks5: bad reply address type"));
          const need = 4 + addrLen + 2;
          if (buffer.length < need) return;
          settled = true;
          clearTimeout(timer);
          socket.removeAllListeners("data");
          // 握手数据已消费完，socket 从这一刻起就是隧道本体。
          resolve(socket);
          return;
        }
      } catch (error) {
        fail(error);
      }
    });

    function sendConnect() {
      stage = "reply";
      const hostBuf = Buffer.from(targetHost);
      const portBuf = Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff]);
      // 域名交给代理解析（socks5h），避免本地 DNS 泄漏。
      write(Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length, ...hostBuf, ...portBuf]));
    }
  });
}

/** HTTP/HTTPS 代理的 CONNECT 隧道。 */
function connectTunnel(proxy, targetHost, targetPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    const headers = { host: `${targetHost}:${targetPort}` };
    if (proxy.username || proxy.password) {
      headers["proxy-authorization"] =
        "Basic " + Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64");
    }
    const transport = proxy.kind === "https" ? https : http;
    const request = transport.request({
      host: proxy.host,
      port: proxy.port,
      method: "CONNECT",
      path: `${targetHost}:${targetPort}`,
      headers,
      agent: false,
      setHost: false,
    });
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { request.destroy(); } catch { /* 忽略 */ }
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const timer = setTimeout(() => fail(new Error(`proxy ${proxy.host}:${proxy.port} CONNECT timed out`)), timeoutMs);
    timer.unref?.();
    request.once("error", (e) => fail(new Error(`proxy ${proxy.host}: ${e.message}`)));
    request.once("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        return fail(new Error(`proxy ${proxy.host} refused CONNECT (HTTP ${res.statusCode})`));
      }
      settled = true;
      clearTimeout(timer);
      resolve(socket);
    });
    request.end();
  });
}

/** 建立到目标的 socket：直连、CONNECT 隧道或 SOCKS5 隧道。 */
async function openSocket(target, proxy, timeoutMs) {
  const secure = target.protocol === "https:";
  const host = bareHost(target.hostname);
  const port = Number(target.port) || (secure ? 443 : 80);
  if (!proxy) {
    const socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`direct ${host}:${port} timed out`)), timeoutMs);
      timer.unref?.();
      socket.once(secure ? "secureConnect" : "connect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    return socket;
  }
  const raw = proxy.kind === "socks5"
    ? await socks5Connect(proxy, host, port, timeoutMs)
    : await connectTunnel(proxy, host, port, timeoutMs);
  if (!secure) return raw;
  const secured = tls.connect({ socket: raw, servername: host });
  await new Promise((resolve, reject) => {
    secured.once("secureConnect", resolve);
    secured.once("error", reject);
  });
  return secured;
}

/**
 * fetch 形状的请求。
 *
 * 只实现搜索用到的部分：method、headers、body、signal、redirect。
 * 返回对象提供 `ok / status / headers.get / text / json`。
 */
export async function proxyFetch(url, init = {}) {
  const target = new URL(String(url));
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error(`unsupported protocol: ${target.protocol}`);
  }
  const timeoutMs = Number(init.timeoutMs) || 20000;
  const configuredProxy = init.searchProxy ?? activeSearchProxy;

  // 只有设置页里显式配置了代理，才由本模块接管传输。
  // 环境变量代理（http_proxy/https_proxy/all_proxy）交给平台 fetch 自己处理：
  // Node 24+ 的 NODE_USE_ENV_PROXY 已经会让 fetch 跟随它们，重复接管反而改变既有行为。
  const proxy = init.proxy
    ? init.proxy
    : configuredProxy === ""
      ? null
      : resolveProxy(target.toString(), { searchProxy: configuredProxy }).proxy;
  const signal = init.signal;

  // 没配代理（或目标命中 no_proxy）时没有隧道可建，直接用平台 fetch：
  // 既有行为（HTTP/2、redirect 语义、测试替身）都不受影响，
  // 自定义传输只用在真正需要代理的那一种情况。
  if (proxy === null) {
    // 显式读 globalThis：测试会把 globalThis.fetch 换成替身，
    // 如果在这里缓存一份实现，替身就拦不到请求了。
    const native = globalThis.fetch;
    if (typeof native !== "function") throw new Error("no fetch implementation available");
    const rest = { ...init };
    delete rest.proxy;
    delete rest.searchProxy;
    delete rest.timeoutMs;
    return native.call(globalThis, target.toString(), rest);
  }

  if (signal?.aborted) throw new Error("aborted");

  const secure = target.protocol === "https:";
  const socket = await openSocket(target, proxy, timeoutMs);

  const headers = { ...(init.headers ?? {}) };
  const bodyText = init.body === undefined || init.body === null ? null : String(init.body);
  if (bodyText !== null && !Object.keys(headers).some((k) => k.toLowerCase() === "content-length")) {
    headers["content-length"] = Buffer.byteLength(bodyText);
  }
  if (!Object.keys(headers).some((k) => k.toLowerCase() === "host")) {
    headers.host = target.host;
  }

  return new Promise((resolve, reject) => {
    const transport = secure ? https : http;
    const request = transport.request({
      host: bareHost(target.hostname),
      port: Number(target.port) || (secure ? 443 : 80),
      path: target.pathname + target.search,
      method: init.method ?? "GET",
      headers,
      agent: false,
      createConnection: () => socket,
    });
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch { /* 忽略 */ }
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const timer = setTimeout(() => fail(new Error(`${target.host} timed out after ${timeoutMs}ms`)), timeoutMs);
    timer.unref?.();

    const onAbort = () => fail(new Error("aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });

    request.once("error", (e) => fail(e));
    request.once("response", (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", (e) => fail(e));
      response.once("end", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(new ProxyResponse(response.statusCode ?? 0, response.headers, Buffer.concat(chunks).toString("utf8")));
      });
    });
    if (bodyText !== null) request.write(bodyText);
    request.end();
  });
}
