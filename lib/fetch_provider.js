// 质量链 fetch provider：接管宿主 web_fetch（替代基础 http provider）。
// T1 直连（跟随重定向，仅文本类内容）→ T2 exa contents（$1/1000 页，清洗正文 markdown，文本质量好且便宜）
// → T3 firecrawl（Markdown，反爬/JS/PDF）→ T4 crawl4ai（Markdown 备份）。
// firecrawl 额度保护：仅在前层（直连/exa）失败时才走；exa 失败静默降级不抛。
// 契约：WebFetchResult { url, statusCode, body: {kind:'html'|'text', content}, truncated }（CLOSED 联合类型）。
// ponytail: 无服务级令牌桶——web_fetch 为单发用户/agent 驱动调用，非扇出；若未来批量调用再引入共享调度。

import https from "node:https";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { callExa, callFirecrawl, callCrawl4ai } from "./fetch_upstream.js";

const T1_MIN_CHARS = 300;
const TEXTUAL = /text\/|json|xml|javascript|application\/json/i;

// ---------- T1.5：系统浏览器无头渲染（执行 JS 过挑战；无浏览器/失败/超时则静默跳过） ----------
const BROWSER_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
let cachedBrowserPath; // undefined = 未检测；null = 无浏览器
function findSystemBrowser() {
  if (cachedBrowserPath !== undefined) return cachedBrowserPath;
  cachedBrowserPath = null;
  for (const p of BROWSER_CANDIDATES) {
    try {
      if (existsSync(p)) {
        cachedBrowserPath = p;
        break;
      }
    } catch {
      // 忽略检测错误
    }
  }
  return cachedBrowserPath;
}

function browserDumpDom(browserPath, url, { timeoutMs = 20000, signal } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--dump-dom", "--virtual-time-budget=10000", url], {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
    } catch {
      resolve(null);
      return;
    }
    let out = "";
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        child.kill();
      } catch {
        // 忽略
      }
      resolve(ok && out.length > 0 ? out : null);
    };
    child.stdout.on("data", (c) => {
      if (out.length < 5 * 1024 * 1024) out += c.toString("utf8");
    });
    child.on("error", () => finish(false));
    child.on("exit", () => finish(true));
    setTimeout(() => finish(false), timeoutMs);
    if (signal) {
      if (signal.aborted) finish(false);
      else signal.addEventListener("abort", () => finish(false), { once: true });
    }
  });
}

/** GET 跟随重定向（≤5 跳），返回最终 URL / 状态 / 正文 / 内容类型；支持 gzip/br/deflate 解压。 */
function httpsGetFollow(url, { headers = {}, timeoutMs = 20000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const hop = (current, left) => {
      const u = new URL(current);
      const req = https.request(
        { hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: "GET", headers, timeout: timeoutMs, signal },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && left > 0) {
            res.resume();
            const next = new URL(res.headers.location, current).toString();
            return hop(next, left - 1);
          }
          const enc = String(res.headers["content-encoding"] || "").toLowerCase();
          let stream = res;
          try {
            if (enc.includes("br")) stream = res.pipe(zlib.createBrotliDecompress());
            else if (enc.includes("gzip")) stream = res.pipe(zlib.createGunzip());
            else if (enc.includes("deflate")) stream = res.pipe(zlib.createInflate());
          } catch {
            stream = res;
          }
          const chunks = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => resolve({ url: current, status: res.statusCode, text: Buffer.concat(chunks).toString("utf8"), contentType: res.headers["content-type"] || "" }));
          stream.on("error", reject);
        }
      );
      req.on("timeout", () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
      req.on("error", reject);
      req.end();
    };
    hop(url, 5);
  });
}

// 完整浏览器请求头（Chrome 128 形态）：部分反爬站（如百度系）对精简头直接 403，完整头可通过。
// 注意：声明了 Accept-Encoding 就必须解压（httpsGetFollow 已支持 gzip/br/deflate）。
const BROWSERISH = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

export function createFetchProvider({ resolveApiKey, logger }) {
  return {
    id: "fs-quality-fetch",
    /** 廉价本地可用性检查（seam 契约要求，禁止网络调用）。 */
    available() { return true; },
    async fetch(request, signal) {
      const url = String(request?.url || "");
      if (!/^https:\/\//i.test(url)) throw new Error(`fs-quality-fetch: only https URLs are supported (got "${url.slice(0, 60)}")`);
      const errors = [];
      // Referer：伪装为"站内点击"（部分反爬站对无 Referer 的匿名请求更严格）
      const headers = { ...BROWSERISH };
      try {
        headers.Referer = new URL(url).origin + "/";
      } catch {
        // URL 已在上面校验过，理论到不了这里
      }

      // T1：直连（文本类内容；二进制交给后层——exa 取正文，PDF 等仍由 firecrawl 处理）
      try {
        const r = await httpsGetFollow(url, { headers, signal });
        if (r.status < 400 && TEXTUAL.test(r.contentType) && r.text.length >= T1_MIN_CHARS) {
          return { url: r.url, statusCode: r.status, body: { kind: "html", content: r.text }, truncated: false };
        }
        if (r.status >= 400) errors.push(`direct HTTP ${r.status}`);
        else errors.push(`direct: ${r.contentType || "unknown type"} ${r.text.length}B`);
      } catch (e) { errors.push(`direct: ${e.message}`); }

      // T1.5：系统浏览器无头渲染（执行 JS 过挑战，抓直连拿不到的页面；无浏览器自动跳过）
      const browserPath = findSystemBrowser();
      if (browserPath) {
        try {
          const html = await browserDumpDom(browserPath, url, { signal });
          if (html && html.length >= T1_MIN_CHARS && !/403 Forbidden|\bcaptcha\b/i.test(html.slice(0, 3000))) {
            return { url, statusCode: 200, body: { kind: "html", content: html }, truncated: false };
          }
          errors.push(html ? `browser: short or challenge page (${html.length}B)` : "browser: no output (timeout or launch failure)");
        } catch (e) {
          errors.push(`browser: ${e.message}`);
        }
      }

      // T2：exa contents（$1/1000 页）——直连失败（反爬/JS/过短）时承接；firecrawl 额度保护：仅在本层失败后才走 T3
      const exaKey = await resolveApiKey("EXA_API_KEY", "exaApiKey").catch(() => undefined);
      if (exaKey) {
        try {
          const text = await callExa(url, exaKey, signal);
          if (text.trim().length >= T1_MIN_CHARS) return { url, statusCode: 200, body: { kind: "text", content: text }, truncated: false };
          errors.push("exa: short content");
        } catch (e) { errors.push(`exa: ${e.message}`); }
      }

      const firecrawlKey = await resolveApiKey("FIRECRAWL_API_KEY", "firecrawlApiKey").catch(() => undefined);
      if (firecrawlKey) {
        try {
          const md = await callFirecrawl(url, firecrawlKey);
          if (md.trim().length >= T1_MIN_CHARS) return { url, statusCode: 200, body: { kind: "text", content: md }, truncated: false };
          errors.push("firecrawl: short content");
        } catch (e) { errors.push(`firecrawl: ${e.message}`); }
      }

      const crawl4aiKey = await resolveApiKey("CRAWL4AI_API_KEY", undefined).catch(() => undefined);
      if (crawl4aiKey) {
        try {
          const text = await callCrawl4ai(url, crawl4aiKey);
          if (text.trim().length >= T1_MIN_CHARS) return { url, statusCode: 200, body: { kind: "text", content: text }, truncated: false };
          errors.push("crawl4ai: short content");
        } catch (e) { errors.push(`crawl4ai: ${e.message}`); }
      }

      logger?.warn?.(`fs-quality-fetch: all tiers failed for ${url}: ${errors.join("; ")}`);
      throw new Error(`fs-quality-fetch: could not fetch ${url} (${errors.join("; ")})`);
    },
  };
}
