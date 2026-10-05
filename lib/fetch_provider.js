// 质量链 fetch provider：接管宿主 web_fetch（替代基础 http provider）。
// T1 直连（跟随重定向，仅文本类内容）→ T2 exa contents（$1/1000 页，清洗正文 markdown，文本质量好且便宜）
// → T3 firecrawl（Markdown，反爬/JS/PDF）→ T4 crawl4ai（Markdown 备份）。
// firecrawl 额度保护：仅在前层（直连/exa）失败时才走；exa 失败静默降级不抛。
// 契约：WebFetchResult { url, statusCode, body: {kind:'html'|'text', content}, truncated }（CLOSED 联合类型）。
// ponytail: 无服务级令牌桶——web_fetch 为单发用户/agent 驱动调用，非扇出；若未来批量调用再引入共享调度。

import https from "node:https";
import { callExa, callFirecrawl, callCrawl4ai } from "./research.js";

const T1_MIN_CHARS = 300;
const TEXTUAL = /text\/|json|xml|javascript|application\/json/i;

/** GET 跟随重定向（≤5 跳），返回最终 URL / 状态 / 正文 / 内容类型。 */
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
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ url: current, status: res.statusCode, text: Buffer.concat(chunks).toString("utf8"), contentType: res.headers["content-type"] || "" }));
        }
      );
      req.on("timeout", () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
      req.on("error", reject);
      req.end();
    };
    hop(url, 5);
  });
}

const BROWSERISH = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", Accept: "text/html,application/xhtml+xml,*/*", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" };

export function createFetchProvider({ resolveApiKey, logger }) {
  return {
    id: "fs-quality-fetch",
    /** 廉价本地可用性检查（seam 契约要求，禁止网络调用）。 */
    available() { return true; },
    async fetch(request, signal) {
      const url = String(request?.url || "");
      if (!/^https:\/\//i.test(url)) throw new Error(`fs-quality-fetch: only https URLs are supported (got "${url.slice(0, 60)}")`);
      const errors = [];

      // T1：直连（文本类内容；二进制交给后层——exa 取正文，PDF 等仍由 firecrawl 处理）
      try {
        const r = await httpsGetFollow(url, { headers: BROWSERISH, signal });
        if (r.status < 400 && TEXTUAL.test(r.contentType) && r.text.length >= T1_MIN_CHARS) {
          return { url: r.url, statusCode: r.status, body: { kind: "html", content: r.text }, truncated: false };
        }
        if (r.status >= 400) errors.push(`direct HTTP ${r.status}`);
        else errors.push(`direct: ${r.contentType || "unknown type"} ${r.text.length}B`);
      } catch (e) { errors.push(`direct: ${e.message}`); }

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
