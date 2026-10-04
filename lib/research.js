// research 工具：一次调用 = 多引擎搜索(auto 路由) + 抓取 top-N 正文 + 带 token 估算的 Markdown 简报。
// 能力对标 free-search-mcp 的 research()/formatting.py（移植方案 P1）。
// 零新增依赖：T1 走平台 ctx.web.fetch，T2/T3 用 node:https 直连 REST。
// 注意：本文件不用全局 fetch(undici) 访问 api.crawl4ai.com——其 Pingora 网关会空 401 拦截 undici 特征。

import https from "node:https";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { getFresh, put as cachePut, search as cacheSearch } from "./cache.js";

// ---------- 输出打磨（formatting.py 等价物） ----------

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff]/g;

/** 粗估 token：CJK ≈ 1.5 字/token，其余 ≈ 4 字符/token。 */
export function estimateTokens(text) {
  if (!text) return 0;
  const cjk = (text.match(CJK_RE) || []).length;
  return Math.ceil(cjk / 1.5 + (text.length - cjk) / 4);
}

const BOUNDARIES = ["\n\n", "\n", "。", "！", "？", ". ", "! ", "? ", " "];

/** 边界感知截断：优先在句子边界断开（≥60% 预算处），返回 [文本, 是否截断]。 */
export function smartTruncate(text, maxChars) {
  if (!text || text.length <= maxChars) return [text ?? "", false];
  const head = text.slice(0, maxChars);
  for (const b of BOUNDARIES) {
    const i = head.lastIndexOf(b);
    if (i >= maxChars * 0.6) return [head.slice(0, i + b.length), true];
  }
  return [head, true];
}

/** ISO 时间 → "3d ago" 式年龄短语；无效返回 ""。 */
export function agePhrase(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  if (s < 30 * 86400) return `${Math.round(s / (7 * 86400))}w ago`;
  if (s < 365 * 86400) return `${Math.round(s / (30 * 86400))}mo ago`;
  return `${Math.round(s / (365 * 86400))}y ago`;
}

/** 轻量 HTML→文本：去脚本样式、标签换空格、折叠空白。
 * ponytail: 朴素正则剥离，无 readability 主内容提取；若正文信噪比不足，接 @mozilla/readability+linkedom 或让 T2/T3 服务端提取。 */
export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

// ---------- 云端抓取（node:https，保留头大小写；undici 会被 crawl4ai 网关拦） ----------

export function httpsJson(method, url, { headers = {}, body, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, headers, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8"), location: res.headers.location || "" }));
      }
    );
    req.on("timeout", () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/** firecrawl /v2/scrape：返回 markdown。undici 特征对其无碍，但统一走 httpsJson。 */
export async function fetchViaFirecrawl(url, apiKey) {
  const r = await httpsJson("POST", "https://api.firecrawl.dev/v2/scrape", {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });
  if (r.status !== 200) throw new Error(`firecrawl HTTP ${r.status}`);
  const data = JSON.parse(r.text);
  const md = data?.data?.markdown;
  if (!md) throw new Error("firecrawl: no markdown");
  return md;
}

/** crawl4ai POST /scrape（注意：此部署无 /v1 前缀；认证头 X-API-Key）。 */
export async function fetchViaCrawl4ai(url, apiKey) {
  const r = await httpsJson("POST", "https://api.crawl4ai.com/scrape", {
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", "User-Agent": "dsh-free-search/0.8" },
    body: JSON.stringify({ url }),
  });
  if (r.status === 429) throw new Error("crawl4ai rate-limited (community plan)");
  if (r.status !== 200) throw new Error(`crawl4ai HTTP ${r.status}`);
  const data = JSON.parse(r.text);
  const content = data?.markdown || (data?.html ? htmlToText(data.html) : "");
  if (!content) throw new Error("crawl4ai: empty content");
  return content;
}

// ---------- 分层抓取编排：T1 平台 fetch → T2 firecrawl → T3 crawl4ai ----------

// ponytail: 字符预算近似 token 预算（3500 字符 ≈ 1500 token 仅对中英混合粗略成立）；要精确再改成按 estimateTokens 逐段截。
const DOC_CHAR_BUDGET = 3500; // 每篇正文预算（字符）
const T1_MIN_CHARS = 300; // T1 结果低于此视为失败，升级 T2
const FIRECRAWL_MAX_PER_CALL = 3; // 共享额度保护（1000 credits/月，三方共池）
const CRAWL4AI_MAX_PER_CALL = 2; // community 5 req/10s
const DOC_CACHE_MAX_AGE_MS = 7 * 24 * 3600 * 1000; // ponytail: 固定 7 天新鲜度；要配置再提参数

async function fetchTiered(ctx, url, title, state) {
  const cached = getFresh(url, DOC_CACHE_MAX_AGE_MS);
  if (cached) return { content: cached.content, tier: "cache", truncated: false };

  // T1：平台官方 fetch provider（重定向/解码/大小限制白送）
  try {
    const r = await ctx.web.fetch({ url });
    const content = r?.body?.kind === "html" ? htmlToText(r.body.content) : r?.body?.content || "";
    if (r.statusCode < 400 && content.length >= T1_MIN_CHARS) {
      cachePut(url, title, content);
      return { content, tier: "direct", truncated: Boolean(r.truncated) };
    }
  } catch { /* 落到 T2 */ }

  // T2：firecrawl（反爬/JS 页面）
  if (state.firecrawlKey && state.firecrawlUsed < FIRECRAWL_MAX_PER_CALL) {
    state.firecrawlUsed += 1;
    try {
      const md = await fetchViaFirecrawl(url, state.firecrawlKey);
      if (md.trim().length >= T1_MIN_CHARS) { cachePut(url, title, md); return { content: md, tier: "firecrawl", truncated: false }; }
    } catch (e) { state.notes.push(`firecrawl fetch failed for ${url}: ${e.message}`); }
  }

  // T3：crawl4ai（备份）
  if (state.crawl4aiKey && state.crawl4aiUsed < CRAWL4AI_MAX_PER_CALL) {
    state.crawl4aiUsed += 1;
    try {
      const text = await fetchViaCrawl4ai(url, state.crawl4aiKey);
      if (text.trim().length >= T1_MIN_CHARS) { cachePut(url, title, text); return { content: text, tier: "crawl4ai", truncated: false }; }
    } catch (e) { state.notes.push(`crawl4ai fetch failed for ${url}: ${e.message}`); }
  }

  return null;
}

// ---------- 工具注册 ----------

const RESEARCH_SOURCE_FIELDS = {
  url: { type: "string" },
  title: { type: "string" },
  snippet: { type: "string" },
  publishedAt: { type: "string" },
};

export function registerResearchTool(ctx, { provider, resolveApiKey, wrapUntrustedBlock }) {
  ctx.inject(["tools"], (sctx) => {
    sctx.effect(() => {
      const dispose = sctx.tools.register(
        defineTool({
          name: "research",
          description:
            "One-call research: search via smart engine routing, fetch the top pages in full, and return a Markdown brief with dated sources, per-document text and a token estimate. Prefer this over web_search + web_fetch chains when a question needs verified, multi-source answers.",
          parameters: {
            question: { type: "string", description: "The research question (plain language works)." },
            depth: { type: "number", description: "How many top sources to fetch in full, 1-5 (default 3)." },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                question: { type: "string" },
                engines: { type: "string" },
                estimatedTokens: { type: "number" },
                sources: { type: "array", items: { type: "object", additionalProperties: false, properties: RESEARCH_SOURCE_FIELDS } },
                documents: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      url: { type: "string" },
                      title: { type: "string" },
                      tier: { type: "string" },
                      truncated: { type: "boolean" },
                      content: { type: "string" },
                    },
                  },
                },
                notes: { type: "array", items: { type: "string" } },
              },
            },
            render(_args, value) {
              const src = value.sources.map((s, i) => {
                const age = s.publishedAt ? ` _(${agePhrase(s.publishedAt)})_` : "";
                return `- [${i + 1}] ${s.title || s.url} — ${s.url}${age}${s.snippet ? `\n      ${s.snippet}` : ""}`;
              });
              const docs = value.documents.map((d) => {
                const mark = d.truncated ? " _(truncated)_" : "";
                return `### [${d.url}] ${d.title || ""}${mark} _(${d.tier})_\n\n${d.content}`;
              });
              const notes = value.notes.length ? `\n## Notes\n${value.notes.map((n) => `- ${n}`).join("\n")}` : "";
              const brief =
                `# Research: ${value.question}\n` +
                `_engines: ${value.engines} · sources: ${value.sources.length} · documents: ${value.documents.length} · ~${value.estimatedTokens} tokens_\n\n` +
                `## Sources\n${src.join("\n") || "No results found."}\n\n` +
                `## Documents\n${docs.join("\n\n") || "(no documents fetched — snippets above are all we have)"}` +
                notes;
              return [{ type: "text", text: `Research brief:\n${wrapUntrustedBlock(brief)}` }];
            },
          },
          async execute(args) {
            const depth = Math.min(5, Math.max(1, Math.round(args.depth ?? 3)));
            const state = {
              notes: [],
              firecrawlUsed: 0,
              crawl4aiUsed: 0,
              firecrawlKey: await resolveApiKey("FIRECRAWL_API_KEY", "firecrawlApiKey").catch(() => undefined),
              crawl4aiKey: await resolveApiKey("CRAWL4AI_API_KEY", undefined).catch(() => undefined),
            };

            // 1) 搜索：multi 模式并发 top-3 引擎融合（多渠道汇总；multi 失败自动退回单引擎回退链）
            let search;
            try {
              search = await provider.search({ query: args.question, maxResults: 12, engine: "multi" });
            } catch (e) {
              return {
                question: args.question, engines: "(search failed)", estimatedTokens: 0,
                sources: [], documents: [],
                notes: [`search failed: ${e.message}`, "Hint: call free_search_test to check engine health, or retry with web_search."],
              };
            }
            const seen = new Set();
            const seenTitles = new Set();
            // ponytail: 去重键只做主机前缀规范化（www/m/mobile 互去）+ 尾斜杠 + 精确标题互去；模糊标题去重留给 P2
            const normKey = (u) => {
              try {
                const x = new URL(u);
                const h = x.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
                return h + x.pathname.replace(/\/+$/, "") + x.search;
              } catch { return u; }
            };
            const normTitle = (t) => String(t || "").trim().replace(/\s+/g, "");
            const sources = (search.sources ?? [])
              .filter((s) => s && typeof s.url === "string")
              .filter((s) => { const k = normKey(s.url); if (seen.has(k)) return false; seen.add(k); return true; })
              .filter((s) => { const t = normTitle(s.title); if (!t) return true; if (seenTitles.has(t)) return false; seenTitles.add(t); return true; })
              .slice(0, 12);

            // 2) 抓取 top-N 正文（并发，失败互不影响）
            const top = sources.slice(0, depth);
            const fetched = await Promise.allSettled(
              top.map((s) => fetchTiered(ctx, s.url, s.title, state))
            );
            const documents = [];
            fetched.forEach((r, i) => {
              const s = top[i];
              if (r.status === "fulfilled" && r.value) {
                const [content, truncated] = smartTruncate(r.value.content, DOC_CHAR_BUDGET);
                documents.push({ url: s.url, title: s.title || "", tier: r.value.tier, truncated: truncated || r.value.truncated, content });
              } else if (r.status === "rejected") {
                state.notes.push(`fetch failed for ${s.url}: ${r.reason?.message || r.reason}`);
              }
            });
            if (top.length > documents.length) {
              state.notes.push(`${top.length - documents.length} of ${top.length} top sources could not be fetched in full; rely on their snippets or retry with web_fetch.`);
            }

            // 3) 汇总：multi 模式的引擎清单在 provider content 的 Note 里（sources 的 seenIn 已被 provider 剥除）
            const enginesNote = typeof search.content === "string" ? search.content.match(/enginesUsed: \[([^\]]*)\]/) : null;
            const out = {
              question: args.question,
              engines: enginesNote && enginesNote[1].trim() ? enginesNote[1].trim() : (search.engineUsed || search.provider || "auto"),
              sources: sources.map((s) => ({ url: s.url, title: s.title || "", snippet: s.snippet || "", publishedAt: s.publishedAt || "" })),
              documents,
              notes: state.notes,
            };
            out.estimatedTokens = estimateTokens(
              out.sources.map((s) => s.title + s.snippet).join("") + out.documents.map((d) => d.content).join("")
            );
            return out;
          },
        })
      );
      const disposeCache = sctx.tools.register(
        defineTool({
          name: "cache_search",
          description:
            "Full-text search over pages previously fetched by the research tool (persistent local cache, entries up to 7 days old). Use to re-find earlier research material without re-fetching.",
          parameters: {
            query: { type: "string", description: "Text to look for in cached page titles and bodies." },
            limit: { type: "number", description: "Max entries to return (default 8)." },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                query: { type: "string" },
                hits: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: { url: { type: "string" }, title: { type: "string" }, excerpt: { type: "string" }, fetched_at: { type: "string" } },
                  },
                },
              },
            },
            render(_args, value) {
              if (!value.hits.length) return [{ type: "text", text: `No cached pages match "${value.query}".` }];
              const lines = value.hits.map((h) => `- ${h.title || h.url} — ${h.url}\n      ${h.excerpt} _(cached ${h.fetched_at})_`);
              return [{ type: "text", text: wrapUntrustedBlock(`Cached pages matching "${value.query}":\n${lines.join("\n")}`) }];
            },
          },
          async execute(args) {
            return { query: args.query, hits: cacheSearch(args.query, Math.min(20, Math.max(1, Math.round(args.limit ?? 8)))) };
          },
        })
      );
      return () => { dispose(); disposeCache(); };
    }, "free-search: research tool");
  });
}
