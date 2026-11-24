// 搜索侧的代理出口。
//
// 引擎用的是全局 `fetch`，它走 undici 的内部 dispatcher，看不到本插件的
// CONNECT 隧道，也不接受自定义 agent —— 所以「搜索走代理」不能靠改 fetch 的参数，
// 必须自己发请求。
//
// 这个模块提供一个与 `fetch` 同形的函数：`proxyFetch(url, init)`。
// 只有设置页里显式填了代理时它才接管传输；否则原样交给平台 fetch，
// 这样既有的 HTTP/2、环境变量代理与测试替身都不受影响。
//
// 支持的代理：http、https（CONNECT 隧道）与 socks5 / socks5h（自定义握手，
// Node 原生没有 SOCKS 客户端）。认证用 Basic。
//
// 与 lib/proxy.js 的关系：那边服务 node:https 的抓取链，这里服务全局 fetch 的引擎，
// 两边共用同一份 no_proxy 判定（matchesNoProxy），避免规则漂移。
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import zlib from "node:zlib";
import { matchesNoProxy, readProxyEnv } from "./proxy.js";

const bareHost = (h) => String(h ?? "").toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");

/**
 * 当前生效的搜索代理。
 *
 * 由配置层在每次搜索前写入（与 blockedDomains / Accept-Language 同样的
 * 模块级活动值模式），这样 40 多个引擎不必各自接收一个参数。
 * 空字符串 = 未配置，交给平台 fetch（它会跟随环境变量代理）。
 */
let activeSearchProxy = "";
/**
 * 兜底取值：没有任何入口写过活动值时，直接问配置。
 *
 * #155 回归的根本原因是「设置活动值」这件事需要每个入口各自记得做一次
 * （searchOnce 记得、runEngineTest 忘过）。这类遗漏没法靠补一行彻底避免，
 * 所以这里再挂一个 resolver：活动值为空时现读配置，入口忘了写也不会退回直连。
 * 生产环境由 index.js 注册；单测直接 import 本模块时没有 resolver，
 * 行为与之前完全一致。
 */
let searchProxyResolver = null;

/** 设置本进程当前使用的搜索代理；空值表示不由本模块接管。 */
export function setActiveSearchProxy(value) {
  activeSearchProxy = typeof value === "string" ? value.trim() : "";
}

/** 注册一个「当前配置里的搜索代理」解析器（启动时注册一次）。 */
export function setSearchProxyResolver(fn) {
  searchProxyResolver = typeof fn === "function" ? fn : null;
}

/** 读取当前生效的搜索代理（测试与诊断用）。 */
export function getActiveSearchProxy() {
  return activeSearchProxy !== "" ? activeSearchProxy : resolveConfiguredProxy();
}

/** 活动值优先，其次现读配置；都没有就是空串（交给平台 fetch）。 */
function resolveConfiguredProxy() {
  if (searchProxyResolver === null) return "";
  try {
    const value = searchProxyResolver();
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
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
  if (url.hostname === "") return null;
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
 * @param env 环境变量（只用来读 no_proxy）
 */
export function resolveProxy(targetUrl, { searchProxy = "", env = process.env } = {}) {
  const explicit = parseProxy(searchProxy);
  if (!explicit) {
    // 未显式配置：环境变量代理交给平台 fetch 自己处理
    // （Node 24+ 的 NODE_USE_ENV_PROXY），这里不重复接管，避免改变既有行为。
    return { proxy: null, source: "direct" };
  }
  // 显式设置优先，但 no_proxy 依然生效：用户列了直连的域名不该被代理。
  const target = new URL(String(targetUrl));
  const port = target.port || (target.protocol === "https:" ? "443" : "80");
  if (matchesNoProxy(bareHost(target.hostname), readProxyEnv(env).noProxy, port)) {
    return { proxy: null, source: "no_proxy" };
  }
  return { proxy: explicit, source: "setting" };
}

/**
 * 这一跳该走哪个代理。逐跳判定 no_proxy：重定向可能换到本机或内网地址，
 * 沿用第一跳的结论会把它们也塞进代理。返回 null 表示这一跳直连。
 */
function proxyForHop(target, configured) {
  if (!configured) return null;
  const proxy = configured.kind === undefined ? parseProxy(String(configured)) : configured;
  if (!proxy) return null;
  const port = target.port || (target.protocol === "https:" ? "443" : "80");
  if (matchesNoProxy(bareHost(target.hostname), readProxyEnv().noProxy, port)) return null;
  return proxy;
}

/** 原生 fetch 的错误形状：引擎按 name 分支区分「超时」和「取消」。 */
function abortError(signal, fallbackMessage) {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  const error = new Error(fallbackMessage ?? "aborted");
  error.name = "AbortError";
  return error;
}

function timeoutError(message) {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}

/** 3xx 在 redirect: "error" 下的形状，和原生 fetch 一样用 TypeError。 */
function redirectError(status, from, to) {
  const error = new TypeError(`unexpected redirect (HTTP ${status}) from ${from} to ${to}`);
  error.cause = { code: "ERR_UNEXPECTED_REDIRECT" };
  return error;
}

/** 解压响应体：引擎都没显式声明 accept-encoding，但服务端仍可能压缩。 */
function decodeEncoding(buffer, encoding) {
  const enc = String(encoding ?? "").toLowerCase().trim();
  if (enc === "" || enc === "identity") return buffer;
  try {
    if (enc === "gzip" || enc === "x-gzip") return zlib.gunzipSync(buffer);
    if (enc === "deflate") {
      try {
        return zlib.inflateSync(buffer);
      } catch {
        return zlib.inflateRawSync(buffer);
      }
    }
    if (enc === "br") return zlib.brotliDecompressSync(buffer);
  } catch {
    // 解压失败时把原始字节交回去，让上层看到可读的错误而不是空 body。
  }
  return buffer;
}

function headerOf(rawHeaders, name) {
  const key = String(name).toLowerCase();
  for (const [k, v] of Object.entries(rawHeaders ?? {})) {
    if (k.toLowerCase() === key) return Array.isArray(v) ? v[0] : v;
  }
  return null;
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

    socket.once("connect", () => {
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
          stage = "reply";
          sendConnect();
          return;
        }
        if (stage === "auth") {
          if (buffer.length < 2) return;
          const status = buffer[1];
          buffer = buffer.subarray(2);
          if (status !== 0x00) return fail(new Error("socks5: authentication rejected"));
          stage = "reply";
          sendConnect();
          return;
        }
        if (stage === "reply") {
          if (buffer.length < 4) return;
          const rep = buffer[1];
          if (rep !== 0x00) {
            const reasons = {
              1: "general failure",
              2: "not allowed",
              3: "network unreachable",
              4: "host unreachable",
              5: "connection refused",
              6: "TTL expired",
              7: "command not supported",
              8: "address type not supported",
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
      // 域名交给代理解析（socks5h），避免本地 DNS 泄漏。
      const hostBuf = Buffer.from(targetHost);
      const portBuf = Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff]);
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

/** 建立到目标的 socket：CONNECT 隧道或 SOCKS5 隧道，TLS 在隧道之上。 */
async function openSocket(target, proxy, timeoutMs) {
  const secure = target.protocol === "https:";
  const host = bareHost(target.hostname);
  const port = Number(target.port) || (secure ? 443 : 80);
  const raw = proxy.kind === "socks5"
    ? await socks5Connect(proxy, host, port, timeoutMs)
    : await connectTunnel(proxy, host, port, timeoutMs);
  if (!secure) return raw;
  const secured = tls.connect({ socket: raw, servername: host });
  await new Promise((resolve, reject) => {
    // TLS 握手没有自己的超时：隧道对端不回话时会一直挂着，
    // 直到外层工具级超时才被收走。这里显式兜住。
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const fail = (error) => {
      try { secured.destroy(); } catch { /* 忽略 */ }
      finish(reject, error);
    };
    const timer = setTimeout(
      () => fail(timeoutError(`TLS handshake with ${host}:${port} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    timer.unref?.();
    secured.once("secureConnect", () => finish(resolve));
    secured.once("error", (error) => fail(error));
    secured.once("close", () => fail(new Error(`tunnel to ${host}:${port} closed before TLS completed`)));
  });
  return secured;
}

/** 发一次请求（不处理重定向）。返回 { status, headers, body }。 */
function requestOnce(target, proxy, hop, timeoutMs, signal) {
  return openSocket(target, proxy, timeoutMs).then(
    (socket) =>
      new Promise((resolve, reject) => {
        const headers = { ...(hop.headers ?? {}) };
        const bodyText =
          hop.body === undefined || hop.body === null
            ? null
            : typeof hop.body === "string"
              ? hop.body
              : String(hop.body);
        if (bodyText !== null && !Object.keys(headers).some((k) => k.toLowerCase() === "content-length")) {
          headers["content-length"] = Buffer.byteLength(bodyText);
        }
        if (!Object.keys(headers).some((k) => k.toLowerCase() === "host")) {
          headers.host = target.host;
        }

        let settled = false;
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          // 一条隧道只服务一次往返；响应读完就关，否则 socket 会一直挂着。
          try { socket.destroy(); } catch { /* 忽略 */ }
          fn(value);
        };
        const fail = (error) => {
          finish(reject, error instanceof Error ? error : new Error(String(error)));
        };
        const timer = setTimeout(
          () => fail(timeoutError(`${target.host} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
        timer.unref?.();
        const onAbort = () => fail(abortError(signal, "aborted"));
        signal?.addEventListener("abort", onAbort, { once: true });

        // 只用 http 模块写 HTTP/1.1 字节；HTTPS 的 TLS 已经在 socket 上完成。
        //
        // 注意不能写 `agent: false`：那样 http 会临时新建一个默认 Agent，
        // 并忽略 options 里的 createConnection，自己直连目标（等于绕过代理）。
        // 正确做法是一次性 Agent，让它的 createConnection 交回我们的隧道 socket。
        const agent = new http.Agent({ keepAlive: false, maxSockets: 1 });
        agent.createConnection = () => socket;
        const request = http.request({
          host: bareHost(target.hostname),
          port: Number(target.port) || (target.protocol === "https:" ? 443 : 80),
          path: target.pathname + target.search,
          method: hop.method ?? "GET",
          headers,
          agent,
        });

        request.once("error", (e) => fail(e));
        request.once("response", (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.once("error", (e) => fail(e));
          response.once("end", () => {
            if (settled) return;
            const raw = Buffer.concat(chunks);
            const body = decodeEncoding(raw, response.headers["content-encoding"]).toString("utf8");
            finish(resolve, { status: response.statusCode ?? 0, headers: response.headers, body });
          });
        });
        if (bodyText !== null) request.write(bodyText);
        request.end();
      })
  );
}

/** 响应对象：只暴露搜索层用到的接口。 */
class ProxyResponse {
  constructor(status, headers, body, url) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.url = url;
    this.headers = new HeadersView(headers);
    this._body = body;
    // serp 的 manual 重定向只取 Location，body 立即丢弃；给个可调用形状即可。
    this.body = { cancel: async () => {} };
  }
  async text() {
    return this._body;
  }
  async json() {
    return JSON.parse(this._body);
  }
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

/**
 * fetch 形状的请求。
 *
 * 实现搜索用到的部分：method、headers、body、signal、redirect（follow / manual / error）。
 * 返回对象提供 `ok / status / url / headers.get / text / json / body.cancel`。
 */
export async function proxyFetch(url, init = {}) {
  let target = new URL(String(url));
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error(`unsupported protocol: ${target.protocol}`);
  }

  const timeoutMs = Number(init.timeoutMs) || 20000;
  const signal = init.signal;
  const redirectMode = init.redirect ?? "follow";
  const maxRedirects = 20;
  const explicitProxy = init.proxy ?? null;
  // 活动值优先；它为空时问解析器（现读配置）。这样即便某个入口忘了
  // setActiveSearchProxy，也不会静默退回直连。
  const configuredProxy = init.searchProxy ?? (activeSearchProxy !== "" ? activeSearchProxy : resolveConfiguredProxy());

  if (explicitProxy === null && configuredProxy === "") {
    // 显式读 globalThis：测试会把 globalThis.fetch 换成替身，
    // 如果在这里缓存一份实现，替身就拦不到请求了。
    //
    // 已 abort 的 signal 也要原样递下去：原生 fetch 自己会带着 signal 拒绝，
    // 在这里抢先抛错会让「调用方的 signal 是否传到了 fetch」变得无法验证。
    const native = globalThis.fetch;
    if (typeof native !== "function") throw new Error("no fetch implementation available");
    const rest = { ...init };
    delete rest.proxy;
    delete rest.searchProxy;
    delete rest.timeoutMs;
    return native.call(globalThis, target.toString(), rest);
  }

  let method = String(init.method ?? "GET").toUpperCase();
  let body = init.body;
  const headers = { ...(init.headers ?? {}) };
  let redirects = 0;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (signal?.aborted) throw abortError(signal, "aborted");

    // 每一跳都重新判定代理：重定向可能换到 no_proxy 内的地址。
    const base = explicitProxy ?? resolveProxy(target.toString(), { searchProxy: configuredProxy }).proxy;
    const proxy = proxyForHop(target, base);

    if (proxy === null) {
      // 这一跳不走代理：交给平台 fetch 直连，语义与原生一致。
      const native = globalThis.fetch;
      if (typeof native !== "function") throw new Error("no fetch implementation available");
      const hopInit = { ...init, method, headers, redirect: redirectMode, signal };
      delete hopInit.proxy;
      delete hopInit.searchProxy;
      delete hopInit.timeoutMs;
      if (body === undefined || body === null) delete hopInit.body;
      else hopInit.body = body;
      return native.call(globalThis, target.toString(), hopInit);
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw timeoutError(`${target.host} timed out after ${timeoutMs}ms`);

    const response = await requestOnce(target, proxy, { method, headers, body }, remaining, signal);

    if (redirectMode === "manual") {
      return new ProxyResponse(response.status, response.headers, response.body, target.toString());
    }

    const location = headerOf(response.headers, "location");
    const isRedirect = response.status >= 300 && response.status < 400 && location !== null;

    if (!isRedirect) {
      return new ProxyResponse(response.status, response.headers, response.body, target.toString());
    }

    if (redirectMode === "error") {
      throw redirectError(response.status, target.toString(), location);
    }

    redirects += 1;
    if (redirects > maxRedirects) {
      throw new TypeError(`too many redirects (> ${maxRedirects}) fetching ${String(url)}`);
    }

    const next = new URL(location, target);
    if (next.protocol !== "http:" && next.protocol !== "https:") {
      throw new TypeError(`redirect to unsupported protocol: ${next.protocol}`);
    }

    // 和原生 fetch 一致：303，以及 301/302 上的非 GET/HEAD，都降级成不带 body 的 GET。
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && method !== "GET" && method !== "HEAD")
    ) {
      method = "GET";
      body = undefined;
      for (const key of Object.keys(headers)) {
        if (/^content-(length|type)$/i.test(key)) delete headers[key];
      }
    }

    target = next;
  }
}
