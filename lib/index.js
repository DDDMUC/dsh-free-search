const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const DDG_LITE_URL = "https://lite.duckduckgo.com/lite/";
const BING_URL = "https://www.bing.com/search";
const MOJEEK_URL = "https://www.mojeek.com/search";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ACCEPT_LANG = "zh-CN,zh;q=0.9,en;q=0.8";

function decodeEntities(text) {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractDdgUrl(rel) {
  if (!rel) return null;
  const m = rel.match(/uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  if (rel.startsWith("//")) return `https:${rel}`;
  return rel;
}

function uniqueSources(sources, limit) {
  const seen = new Set();
  const out = [];
  for (const s of sources) {
    if (s.url && !seen.has(s.url)) {
      seen.add(s.url);
      out.push(s);
    }
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchHtml(url, signal) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, "accept-language": ACCEPT_LANG },
    signal,
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url.split("?")[0]}`);
  }
  return response.text();
}

const ENGINE_IDS = ["ddg", "ddg-lite", "bing", "mojeek"];

class DuckDuckGoHtmlProvider {
  id = "ddg";
  constructor(options) {
    this.options = options ?? {};
  }
  available() {
    return true;
  }
  async search(request, signal) {
    const params = new URLSearchParams({ q: request.query });
    if (this.options.region) params.set("kl", this.options.region);
    const html = await fetchHtml(`${DDG_HTML_URL}?${params}`, signal);
    const blocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) ?? [];
    const sources = [];
    for (const block of blocks) {
      const urlMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"/);
      const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/);
      const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/);
      const dateMatch = block.match(/<span[^>]*>\s*([\dT:.+-]+)\s*<\/span>/);
      const url = extractDdgUrl(urlMatch?.[1]);
      if (!url) continue;
      sources.push({
        url,
        ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
        ...(snippetMatch ? { snippet: stripTags(snippetMatch[1]) } : {}),
        ...(dateMatch ? { publishedAt: dateMatch[1] } : {}),
      });
    }
    return { sources: uniqueSources(sources, request.maxResults ?? 10), truncated: false };
  }
}

class DuckDuckGoLiteProvider {
  id = "ddg-lite";
  constructor(options) {
    this.options = options ?? {};
  }
  available() {
    return true;
  }
  async search(request, signal) {
    const params = new URLSearchParams({ q: request.query });
    const html = await fetchHtml(`${DDG_LITE_URL}?${params}`, signal);
    const linkMatches = html.match(/<a[^>]*class=['"]result-link['"][^>]*>[\s\S]*?<\/a>/g) ?? [];
    const snippetMatches = html.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g) ?? [];
    const sources = [];
    for (let i = 0; i < linkMatches.length; i++) {
      const tag = linkMatches[i];
      const hrefMatch = tag.match(/href="([^"]*)"/);
      const titleMatch = tag.match(/class=['"]result-link['"][^>]*>(.*?)<\/a>/);
      if (!hrefMatch) continue;
      const url = extractDdgUrl(hrefMatch[1]);
      if (!url) continue;
      const snippet = snippetMatches[i]?.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/)?.[1];
      sources.push({
        url,
        ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
        ...(snippet ? { snippet: stripTags(snippet) } : {}),
      });
    }
    return { sources: uniqueSources(sources, request.maxResults ?? 10), truncated: false };
  }
}

class BingProvider {
  id = "bing";
  constructor(options) {
    this.options = options ?? {};
  }
  available() {
    return true;
  }
  async search(request, signal) {
    const params = new URLSearchParams({ q: request.query, mkt: this.options.market ?? "zh-CN" });
    const html = await fetchHtml(`${BING_URL}?${params}`, signal);
    const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? [];
    const sources = [];
    for (const block of blocks) {
      const hrefMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"/);
      const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/);
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
      if (!hrefMatch) continue;
      sources.push({
        url: hrefMatch[1],
        ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
        ...(snippetMatch ? { snippet: stripTags(snippetMatch[1]) } : {}),
      });
    }
    return { sources: uniqueSources(sources, request.maxResults ?? 10), truncated: false };
  }
}

class MojeekProvider {
  id = "mojeek";
  constructor(options) {
    this.options = options ?? {};
  }
  available() {
    return true;
  }
  async search(request, signal) {
    const params = new URLSearchParams({ q: request.query });
    const html = await fetchHtml(`${MOJEEK_URL}?${params}`, signal);
    const blocks = html.match(/<li class="r\d+[\s\S]*?<\/li>/g) ?? [];
    const sources = [];
    for (const block of blocks) {
      const titleMatch = block.match(/<a[^>]*class="title"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/);
      const snippetMatch = block.match(/<p class="s">([\s\S]*?)<\/p>/);
      if (!titleMatch) continue;
      sources.push({
        url: titleMatch[1],
        ...(titleMatch[2] ? { title: stripTags(titleMatch[2]) } : {}),
        ...(snippetMatch ? { snippet: stripTags(snippetMatch[1]) } : {}),
      });
    }
    return { sources: uniqueSources(sources, request.maxResults ?? 10), truncated: false };
  }
}

const name = "web-search-free";
const inject = ["web"];

function apply(ctx, config) {
  const registry = config?.engines ?? { ddg: true };
  for (const engine of ENGINE_IDS) {
    if (registry[engine] === false) continue;
    let provider;
    switch (engine) {
      case "ddg":
        provider = new DuckDuckGoHtmlProvider({ region: config?.region });
        break;
      case "ddg-lite":
        provider = new DuckDuckGoLiteProvider();
        break;
      case "bing":
        provider = new BingProvider({ market: config?.bingMarket });
        break;
      case "mojeek":
        provider = new MojeekProvider();
        break;
    }
    if (provider) ctx.web.registerSearchProvider(provider);
  }
}

export {
  BING_URL,
  DDG_HTML_URL,
  DDG_LITE_URL,
  MOJEEK_URL,
  BingProvider,
  DuckDuckGoHtmlProvider,
  DuckDuckGoLiteProvider,
  MojeekProvider,
  apply,
  inject,
  name,
};
