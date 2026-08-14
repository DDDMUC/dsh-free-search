const DDG_PROVIDER_ID = "ddg";
const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractUrl(rel) {
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

function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

class DuckDuckGoSearchProvider {
  id = DDG_PROVIDER_ID;

  constructor(options) {
    this.options = options;
  }

  available() {
    return this.options !== undefined;
  }

  async search(request, signal) {
    const query = request.query;
    const params = new URLSearchParams({ q: query });
    if (this.options.region) params.set("kl", this.options.region);

    let response;
    try {
      response = await fetch(`${DDG_HTML_URL}?${params}`, {
        headers: { "user-agent": USER_AGENT },
        signal,
        redirect: "follow",
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(`DuckDuckGo search request failed: ${String(error)}`);
    }
    if (!response.ok) {
      throw new Error(`DuckDuckGo API error (HTTP ${response.status})`);
    }

    const html = await response.text();
    const sources = [];
    const resultBlocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) ?? [];

    for (const block of resultBlocks) {
      if (sources.length >= (request.maxResults ?? 10)) break;
      const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/);
      const urlMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"/);
      const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/);
      const dateMatch = block.match(/<span[^>]*>\s*([\dT:.+-]+)\s*<\/span>/);
      if (!urlMatch) continue;
      const url = extractUrl(urlMatch[1]);
      if (!url || sources.some((s) => s.url === url)) continue;
      sources.push({
        url,
        ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
        ...(snippetMatch ? { snippet: stripTags(snippetMatch[1]) } : {}),
        ...(dateMatch ? { publishedAt: dateMatch[1] } : {}),
      });
    }

    return { sources, truncated: sources.length > (request.maxResults ?? 10) };
  }
}

const name = "web-search-ddg";
const inject = ["web"];

function apply(ctx, config) {
  ctx.web.registerSearchProvider(
    new DuckDuckGoSearchProvider({
      region: config?.region,
    })
  );
}

export { DDG_PROVIDER_ID, DuckDuckGoSearchProvider, apply, inject, name };
