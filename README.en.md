# dsh-free-search

[![ci](https://github.com/DDDMUC/dsh-free-search/actions/workflows/ci.yml/badge.svg)](https://github.com/DDDMUC/dsh-free-search/actions/workflows/ci.yml)

**Free web search for DeepSeek Harness, with multiple engines and keyless options.**

[中文](./README.md#中文) · [English](#english)

---

## English

<div align="center">
  <a href="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-overview.png">
    <img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-overview.png" alt="Settings overview" width="820" />
  </a>
  <br>
  <sub>▲ Settings overview</sub>
</div>

### Who Needs It

If you:

- do not have (or do not want) an official DeepSeek key and found that search fails while you use a third-party model provider
- did configure an official key, yet you clearly use a third-party model provider and the DeepSeek account is still billed for searches

All of this happens because dsh's default search provider depends on the official DeepSeek API key (`DEEPSEEK_API_KEY`). Without the official key, built-in search fails; with it, even when you use a third-party model provider, searches go through the official channel and quietly bill the DeepSeek account.

This plugin solves exactly that: multiple free engines plus automatic fallback, so DSH no longer depends on the DeepSeek official key.

### Features

#### Engines and switching

- **Zero Cost** — Multiple free engines with no API key or registration required
- **43 engines available** — DuckDuckGo (HTML / Lite), Bing, AnySearch AI, SearXNG (meta-search with custom instances), Exa, Tavily, Keenable, Firecrawl, Parallel, Brave (`brave`, official Search API, needs `BRAVE_API_KEY`), Zhipu (`zhipu`, official Web Search API, needs `ZHIPU_API_KEY`), Perplexity, SerpBase, Serply, Outcrawl, SpecStream (`specstream`, official Search API, needs `SPECSTREAM_API_KEY`), Google Programmable Search (`google`, needs an API key plus a CSE ID), Metaso (秘塔搜索, official API, billed per call), Yandex Search (official API, billed per request, folder ID required), Tencent Yuanbao Search (API-key gateway with a limited free-quota activity), DeepSeek Official, DeepSeek Native Search API, You.com, Baidu Qianfan, Kimi, Aliyun Bailian, Volcano Doubao, Zhihu web-wide/site search (`zhihu_global`/`zhihu_site`, via the Zhihu open-platform MCP), Antigravity CLI search (`agy`, requires the local CLI), and the model-based OpenAI / Gemini / Claude searches. The default auto-fallback chain covers 30 of them; the 5 HTML SERP engines stay out by default and the per-call billed OpenAI / Gemini / Claude engines, Metaso, Yandex, Yuanbao and SpecStream run only when explicitly named.
- **5 HTML SERP engines (off by default)** — Traditional result pages join the same engine / fallback / cooldown / settings machinery: `baidu-html` (Baidu web), `so360`, `sogou`, `wechat` (WeChat articles) and `toutiao`. No key, no quota — the trade-off is scraping: captcha/anti-bot pages are classified as `bot-wall` and cool the whole family down for 10 minutes (the egress IP gets flagged as a whole), and results carry no API snippets. They never join auto routing, the fallback chain or the language pools; they only run when named via `engine=` or added to a pool.
- **Engine allowlist** — the plugin keeps a single `allowedEngines` enable list. Unchecked engines are removed from every search chain, Auto / Multi routing, engine tests and prompts. Engines added by later versions stay off until checked.
- **Global engine enable list & fallback priority** — the checklist is the allowlist itself: checked engines run, unchecked engines are excluded everywhere (web_search fallback, Auto routing, advanced_search, multi_search, engine tests). Engines added by later versions stay off. Reorder the global fallback chain with ↑↓ (one-click reset).
- **Popup Switch Command** — Type `/free-search-engine` in the chat: a picker opens with all engines; click one to switch (equivalent to the settings page + save).
- **Visual Badges** — Free engines feature a green `FREE` badge, while paid engines show an orange `API KEY` badge in the settings UI.

<img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-engines.png" alt="Engine switching, global switches and the whitelist" width="100%" />
<sub>▲ Engine switching, global switches and the whitelist; green FREE / orange API KEY badges</sub>

#### Fallback, cooldowns and updates

- **Unified Engine Fallback** — Any engine failure (paid or free, missing key, 401, rate limit, network error) automatically tries the next engine: the configured engine first, then other engines (exa/tavily/keenable/firecrawl/parallel/you are tried even without a key because they have built-in keyless quota), then the remaining free engines (Bing/AnySearch etc.) — with a note attached to the results naming the engine that actually served them (e.g. `Note: perplexity unavailable or failed, using exa.`). Failures are classified: quota/auth failures cool the engine down for the session, anti-bot walls back off briefly, timeout/5xx/rate-limit failures retry the same engine once, and parse errors / 0 results are reported without cooling it down. Search never fails outright.
- **Multi-key rotation** — Any key field (or its env var) accepts several keys separated by commas, semicolons or newlines. Keys are used round-robin per request, and on 401/402/429 the same engine retries with the next key before the engine-level fallback runs. This also applies inside `multi` mode (#96).
- **Per-key cooldowns and diagnostics** — a 429 or quota error cools the key that hit it, not every other key of the same engine; the state is written to disk and survives a restart; keys are masked in failure text and logs; the Diagnose button at the bottom of the settings page lists why each engine is currently unavailable, how long its cooldown has left, and the in-process call count, success/empty/failure split and average latency; concurrent calls to one engine queue beyond 2 (1 for HTML SERP), so a free engine is not hammered in the same second; the doctor also reports the active web search/fetch provider and warns when another plugin owns it (providers are mutually exclusive).
- **Built-in updater** — the card footer shows the version and a Check update button; npm installs upgrade to latest in one click, while a local link install links to the npm page and points at git pull instead.
- **Engine Testing** — `free_search_test` for the agent to check all engines in one call; the settings UI also has a "Test engine" button that tests the selected engine directly (no fallback chain; paid engines without a key report an explicit error).
- **Truncation safety** — titles and snippets are cut by code point, and search results, tool output and web_fetch bodies are stripped of lone surrogates before leaving the plugin; an emoji can no longer make history unserializable (#108).

<img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-footer.png" alt="Card footer: version, check update, diagnose and engine test" width="100%" />
<sub>▲ Footer: version, Check update, Diagnose, Test engine, reset, discard and save</sub>

#### Multi and language pools

- **Multi mode** — pick `Multi Search` as the engine: web_search queries **every enabled engine of the query's language pool** concurrently (no longer top 3; zh/en pools editable in the settings UI, minimum 2 engines each), merges/deduplicates URLs (same-site detection via **eTLD+1**) and prioritizes cross-source hits; the settings UI offers **Fast / Balanced / Deep** presets or your own cap and target numbers; the whole run shares one **30-second budget** and returns whatever it already has when time is up; the final unique-result ceiling is configurable in Settings (`multiMaxResults`, default 20, max 100, while a per-call `maxResults` can only ask for fewer). Merged results are de-duplicated with MinHash. This costs more quota; a failed multi run automatically falls back to the single-engine chain.
- **Intent routing** — when no custom fallback order is set, Auto reorders the current language pool by query domain (finance / academic / code / news / shopping); it only changes the order of engines already selected, never adds engines or changes the fallback set.

<img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-performance.png" alt="Performance: cache and Multi presets" width="100%" />
<sub>▲ Performance: result cache TTL and the Fast / Balanced / Deep Multi presets</sub>

<img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-pools.png" alt="Language pools" width="100%" />
<sub>▲ Language pools: separate Chinese / English lists, drag to reorder, add or remove engines</sub>

#### Search behaviour

- **Result Caching** — Identical queries (same engine / time-filter args) hit an LRU cache (50 entries) for up to 5 minutes, protecting free engines from rate-limiting and saving paid quota; the TTL is configurable from 0-5 minutes in the settings UI (0 disables caching).
- **Domain blocklist & safe search** — `blockedDomains` keeps matching domains out of every result; `safeSearch` (`off` / `moderate` / `strict`) adds a filter layer for Bing / DuckDuckGo.

<img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-behavior.png" alt="Search behaviour: domain blocklist, prompt language, safe search and Bing market" width="100%" />
<sub>▲ Search behaviour: domain blocklist, prompt language, safe search and Bing market</sub>

#### Fetch and tools

- **Webpage Fetching (`web_fetch`)** — Allows the agent to read full webpage contents (official `dsh-web-fetch-http` provider, pure JS, zero extra dependencies); it can take over `web.fetchProvider` with the plugin's direct → browser render → exa / firecrawl → crawl4ai quality chain. The direct tier handles `http://` as well as `https://` targets and picks the transport per hop; only schemes other than `http(s)` are refused. The headless browser tier can be switched off in Settings and the exa/firecrawl order is configurable; loopback, private-network and cloud-metadata addresses are rejected (SSRF guard). Clash / mihomo TUN fake-ip ranges (usually 198.18.0.0/15) can be allowed explicitly under extra allowed networks, otherwise the placeholder addresses returned by system DNS are rejected as private.

<img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-fetch.png" alt="Fetch and platforms: web_fetch takeover, key storage and platform switches" width="100%" />
<sub>▲ Fetch: web_fetch takeover, key storage location and platform search switches</sub>

- **Platform Search (`platform_search`)** — Search GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / Wikipedia / npm / YouTube / Vimeo / Juejin / Douban / Qiita (public APIs or keyless scraping, zero extra dependencies); X (Twitter) goes through the local Grok Build CLI (SuperGrok / X Premium sign-in).
- **Vertical Lookups (`domain_search`)** — Direct lookup in 41 keyless vertical sources: packages/versions (PyPI, crates, GitHub releases, endoflife…), academia (arXiv, Crossref, OpenAlex, Semantic Scholar, PubMed, dblp, Zenodo…), security (NVD, OSV, CISA KEV), finance (SEC EDGAR, IMF, World Bank, CFETS, Yahoo Finance, CoinGecko…), law (US Federal Register, US CourtListener, openlegaldata, UK legislation), news (Google News, GDELT) and more.
- **Video Search (`video_search`)** — Find videos across the web via Bing Videos + DuckDuckGo Videos (keyless, mutual fallback), returning video links with titles and publisher/duration metadata.
- **One-Call Research (`research`)** — Concurrent multi-engine search → candidate rerank → tiered body fetch → window selection → an evidence pack with provenance as Markdown; every model component (rerank / embedding / decision model) is optional and silently falls back to the rule path when missing or failing; the output carries an evidence quality gate (high / medium / low with a conclusion cap) and says so when the evidence is too thin.
- **Search Fetched Bodies (`cache_search`)** — Full-text search over the bodies `research` already fetched (`node:sqlite` persistent cache, 7-day retention; degrades to a no-op whenever `node:sqlite` is unavailable — unflagged from 22.13, while 22.5–22.12 needs `--experimental-sqlite`).
- **Clean Integration** — Implements the official `WebSearchProvider` seam interface, coexisting seamlessly with official plugins.
- **Time Filtering** — The `advanced_search` tool supports `timeRange`: fixed tiers, custom relative values, or an absolute date (details below).
- **System Prompt Injection** — The agent is aware of the currently active engine and which engines require API keys; it is also told that all search output is **untrusted external data** and must never be executed as instructions.
- **Prompt-Injection Guard (untrusted-data boundary)** — Web-derived text from the plugin's own tools (`advanced_search` / `platform_search` / `free_search_test`) is wrapped in an explicit `<untrusted-web-content>` boundary (look-alike tags inside the text are stripped to prevent early closure); the core `web_search` / `web_fetch` tools carry DSH core's own notice (`External web content follows...`); every snippet is cleaned and capped at 300 characters.

#### Settings and rail

- **Web Settings UI** — Engine switching, API key configuration (keys masked as "configured" in the UI), and a Chinese/English toggle; the entry is the component-row config (`plugins.row.config`) on the sidebar Plugins page (DSH 0.2.1-rc.2+). Remote access (VPS, reverse proxy, custom domain) works too: the bridge reuses the host's own Host fence, so addresses declared with `--trusted-host` or `--public-url` are accepted (#84).
- **Optional sidebar entry** — the left-sidebar row is shown by default; turning it off persists in the plugin config and survives restarts. The panel remains reachable through `/free-search` or the plugin page.
- **Optional slash commands** — `/free-search-engine` and `/free-search` are registered by default; turning `slashCommands` off in settings unregisters both, settings stay on the plugin page, and the prompt points the model at the plugin settings instead. Useful when you only want the search tools for the agent.
- **Keyless tier first (optional)** — by default an engine with a key always uses it. With `keylessFirst` on in settings, Exa / Tavily / Keenable / Firecrawl / Parallel / AnySearch / You.com try their keyless tier first and switch to the key only when that tier is rate limited, out of quota, asks for auth or fails to connect (retried once within the same request). A failed keyless tier rests for a while (at most 45 minutes), and searches go straight to the key meanwhile. Useful when the key is pay-as-you-go and should be the backup.

<img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-apikeys.png" alt="Global fallback priority and per-engine API keys" width="100%" />
<sub>▲ Global fallback priority: one engine per row, its API key on the right (configured keys are masked)</sub>

- **Right-hand section rail** — A floating list (Engines / Fallback / Language pools / Search behaviour / Fetch / Performance / Prompts) sits in the page margin to the right of the card: it highlights the section you are in while scrolling and jumps smoothly on click. It never narrows the card, and hides itself when the margin is too tight. Every entry is a real link (`#/panel/plugins/dsh-free-search/<section>`), so it can be copied or opened in a tab - see the section-link contract below.

<img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-rail.png" alt="Right-hand section rail" width="100%" />
<sub>▲ Right-hand section rail: seven sections, highlighted as you scroll</sub>

### The prompt has three segments

The seventh section is split into state, tools and constraints. Each has its own pager: page 1 is the built-in English page and page 2 the built-in Chinese one, both generated from the current config, never stored, and neither deletable nor editable; page 3 onwards is yours. What gets sent is the current page of each segment, joined; when all three are empty nothing is injected.

<img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-prompt.png" alt="Prompt segments: state, tools and constraints" width="100%" />
<sub>▲ Three prompt segments: state / tools / constraints; page 2 is the built-in Chinese page, tool lines are read only</sub>

The tools segment is one row per tool: the checkbox decides whether the tool is handed to the model, and the box next to it shows the line written for that tool. Those lines are read only and follow plugin updates. The top right has a Chinese/English switch that flips every tool at once, and the list starts with a Select all checkbox: check it to hand every tool to the model, clear it to hand none, and it shows the half state when only some are checked. An unchecked tool is not handed to the model, its tool description leaves the request too, and the segment stops listing it. Put your own requirements on a custom page of the constraints segment.

### Section-link contract (with dsh-url-router)

Rules live in `dsh-url-router/docs/panel-sections.md` (no fixed count; seven sections today: engines / fallback / pools / behavior / fetch / performance / prompt):

- the page root publishes **exactly one** `data-dsh-panel-section="<id>"` = the section the reader is looking at (it follows scrolling; it never guesses "at the bottom = last section")
- every section container carries `data-dsh-section="<id>"` (the scroll target)
- every rail entry is `<a data-dsh-section="<id>" href="#/panel/plugins/dsh-free-search/<id>">`
- this plugin **never writes the URL**: `location.hash` / `history.pushState` / `history.replaceState` are untouched because dsh-url-router owns the address bar; when a section link appears there, a `hashchange` listener scrolls that section into view

Adding a section takes three steps: put `data-dsh-section="<new id>"` on the container, add one `NAV_ITEMS` entry (the rail anchor is generated from `item.id`), and add the id to `assert-rail-section`.


If this plugin has been helpful, a ⭐ on [GitHub](https://github.com/DDDMUC/dsh-free-search) would mean a lot — it's the biggest motivation for the developer to keep maintaining it. Thank you!

### Supported Engines

| id | Engine | Cost | Keyless | Description |
|---|---|---|---|---|
| `auto` | Auto Smart Routing | Dynamic | Pool-dependent | **Smartly routes engines based on query language/time filter** (Chinese queries prioritize Bing/Baidu/Aliyun/AnySearch, English queries prioritize Bing/Exa/Tavily; time filters prioritize time-capable engines), with full fallback |
| `ddg` | DuckDuckGo HTML | Free | Yes | Occasional rate limits (anti-bot challenges); recovers automatically |
| `ddg-lite` | DuckDuckGo Lite | Free | Yes | Lightweight version; same rate-limit behavior as above |
| `bing` | Bing | Free | Yes | No key, optimized for Chinese (`zh-CN`); the automatic default on a mainland egress |
| `anysearch` | AnySearch AI | Free | Yes | AI search, no key needed (anonymous quota) |
| `searxng` | SearXNG Meta Search | Free | Yes | Multi-instance automatic failover; supports custom instances |
| `degoog` | Degoog (self-hosted aggregator) | Free | Yes (instance) | Needs your own instance (`degoogInstances`), no key; `degoogApiKey` (Bearer) only if the instance enables API keys |
| `exa` | Exa | Free | Optional | **Usable without a key** (anonymous MCP); configure a key for higher quota |
| `tavily` | Tavily | Free | Optional | **Usable without a key** (keyless anonymous); configure a key for higher quota |
| `keenable` | Keenable | Free | Optional | **Usable without a key** (anonymous MCP); configure a key for higher quota |
| `firecrawl` | Firecrawl | Free | Optional | **Usable without a key** (official keyless anonymous quota); a key adds higher limits. Note: the keyless tier is judged by **egress IP** — VPN/proxy egress gets a 403, in which case the plugin cools it down for 6 hours and says why (a key is unaffected) |
| `parallel` | Parallel | Free | Optional | **Works without a key** (official MCP anonymous quota); a key raises limits and enables precise time filtering |
| `brave` | Brave Search | Paid (free allowance) | No | Requires `BRAVE_API_KEY` ([API Dashboard](https://api-dashboard.search.brave.com); $5/month free credit ≈ 1,000 queries, then $5 per 1,000); independent index, `freshness` supports pd/pw/pm/py and date ranges |
| `zhipu` | Zhipu Web Search | Paid (per call) | No | Requires `ZHIPU_API_KEY`; `search_std` ¥0.01/call, `search_pro` ¥0.03/call, Sogou/Quark ¥0.05/call; supports oneDay/oneWeek/oneMonth/oneYear recency |
| `you` | You.com | Free | Optional | **Works without a key** (official keyless tier, 100 searches a day); set `YDC_API_KEY` for higher limits (the old `YOUCOM_API_KEY` name still works) |
| `agy` | Antigravity CLI | Free | Yes (CLI) | Requires the [Antigravity](https://antigravity.google) CLI installed and signed in; invoked as `agy -p`, no key and no quota, enabled by default and skipped automatically when the CLI is absent |
| `perplexity` | Perplexity | Paid | No | Requires `PERPLEXITY_API_KEY` |
| `serpbase` | SerpBase | Paid | No | Requires `SERPBASE_API_KEY` (serpbase.dev, 100 free queries on signup) |
| `serper` | Serper.dev | Paid | Yes | Requires `SERPER_API_KEY` (serper.dev, 2,500 free queries on signup); `X-API-KEY` auth, time filtering via Google `tbs` |
| `serply` | Serply | Paid | No | Requires `SERPLY_API_KEY` (serply.io, 2,500 free credits for the first 30 days); Google web results localized to the settings language |
| `outcrawl` | Outcrawl | Paid | No | Requires `OUTCRAWL_API_KEY` (outcrawl.ai, free tier of 1,000 credits a month); web results with title, URL and snippet, up to 20 per search |
| `google` | Google Programmable Search | Free quota | No | Requires `GOOGLE_CSE_API_KEY` and a Programmable Search Engine ID (`googleCseId` / cx); official Custom Search JSON API, 100 free queries/day then billed; supports `hl`, safe search and `dateRestrict` time filtering |
| `metaso` | Metaso (秘塔搜索) | Paid (credits) | No | Requires `METASO_API_KEY` (metaso.cn/api); official AI search API billed per call (about ¥0.03/query, trial credits for new accounts); supports webpage / document / scholar scopes and returns summaries with sources; not in the default fallback order, use it explicitly after configuring a key |
| `yandex` | Yandex Search | Paid | No | Requires `YANDEX_API_KEY` and `yandexFolderId` (AI Studio; billed per request to a billing account); official Search API with RU/TR/COM/KK/BE/UZ search types and Base64 XML responses; supports day / 2 weeks / month time filters; explicit-only |
| `yuanbao` | Tencent Yuanbao Search | Paid (limited free-quota activity) | No | Requires `TENCENTCLOUD_WSA_APIKEY` (console.cloud.tencent.com/wsapi); API-key gateway with natural / authoritative / hybrid modes, site restriction and time ranges; the activity page offers a limited daily free quota; explicit-only |
| `specstream` | SpecStream | Paid | No | Requires `SPECSTREAM_API_KEY` (specstream.ai); web results with title, URL, snippet and publish date, up to 10 per search; explicit-only (never enters the default fallback chain, Auto routing, or language pools) |
| `deepseek-official` | DeepSeek Official | Paid | No | Requires `DEEPSEEK_API_KEY`; uses the Anthropic-compatible `web_search` server tool, so every search is a full model turn (slow, token-billed) |
| `deepseek-tools` | DeepSeek Native Search API | Paid | No | Requires `DEEPSEEK_API_KEY` (shared with the row above); calls `POST /v1/tools/search` directly, no model involved, returns structured `results[]` (`title`/`url`/`summary`/`date`) — measured ~0.3s vs ~5-6s for the row above; the endpoint is configurable via `deepseekToolsBaseUrl` (full URL or base; use the full URL for a gateway exposing `/v1/search`) and the key can be overridden with `deepseekToolsApiKey` for custom gateways |
| `baidu` | Baidu Qianfan AI Search | Quota | No | Requires `BAIDU_API_KEY` (Qianfan AI Search: 50 free web_search calls/day; when that quota is exhausted or returns 403 it falls back to chat/completions, which has a separate 100/day free quota; pay-as-you-go beyond); Chinese web-wide, supports time filtering |
| `kimi` | Kimi (Moonshot) Web Search | Paid | No | Requires `MOONSHOT_API_KEY` (basic ~¥0.01/call); returns Chinese results with body chunks; **no free quota**, so prefer explicit selection or the escalation pool over the default concurrent pool |
| `kimi` | Kimi (Moonshot) Web Search | Paid | No | Requires `MOONSHOT_API_KEY` (basic ~¥0.01/call); returns Chinese results with body chunks |
| `aliyun` | Aliyun Bailian EnhancedSearch | Paid | No | Requires `DASHSCOPE_API_KEY` (MCP search_pro, ~¥0.03/call, 200 free calls for new users); Chinese web-wide with source hostnames |
| `doubao` | Volcano Web Search (Doubao) | Free quota | No | Requires `DOUBAO_SEARCH_API_KEY` (open it in the Web Search console; **500 free queries/month**, pay-as-you-go beyond); strong for fresh Chinese content, supports time/site filters, returns long summaries |
| `zhihu_global` | Zhihu web-wide search (open-platform MCP) | Free quota | No | Requires `ZHIHU_API_KEY`; **5,000 calls/day trial quota** (paid access after the trial); supports the time filter (`publish_time`); skipped automatically when no key is set |
| `zhihu_site` | Zhihu site search (open-platform MCP) | Free quota | No | Requires `ZHIHU_API_KEY`; **5,000 calls/day trial quota** (shared with `zhihu_global`); time filtering not offered |
| `zhihu_global` | Zhihu web-wide search (open-platform MCP) | Paid | No | Requires `ZHIHU_API_KEY`; supports the time filter (`publish_time`); skipped automatically when no key is set |
| `zhihu_site` | Zhihu site search (open-platform MCP) | Paid | No | Requires `ZHIHU_API_KEY`; time filtering not verified, so it is not offered |
| `openai` | OpenAI built-in web search | Paid | No | Requires `OPENAI_API_KEY`; uses the Responses API `web_search` tool and returns a cited answer. **Billed per search, explicit selection only** (never picked by the fallback chain or Auto); default `gpt-6-luna`, model/endpoint configurable (`openaiModel` / `openaiBaseUrl`) |
| `gemini` | Gemini grounding with Google Search | Paid | No | Requires `GEMINI_API_KEY` (falls back to `GOOGLE_API_KEY`); uses the recommended **Interactions API** (`POST /v1beta/interactions`, `tools:[{type:"google_search"}]`) and reads citations from `steps[].content[].annotations`. **Billed per search, explicit selection only**; default `gemini-3.8-flash`, model/endpoint configurable (`geminiModel` / `geminiBaseUrl`) |
| `claude` | Claude server-side web_search | Paid | No | Requires `ANTHROPIC_API_KEY`; results come from `web_search_tool_result`. **Billed per search, explicit selection only**; default `claude-sonnet-5-5`, model/endpoint configurable (`claudeModel` / `claudeBaseUrl`) |
| `baidu-html` | Baidu web (HTML) | Free | Yes | Broadest Chinese web coverage of the family; 2–3 back-to-back requests can trigger a captcha, which cools the family down for 10 minutes. The API-based Baidu engine is `baidu` (Qianfan) |
| `so360` | 360 Search | Free | Yes | Chinese web; the strictest anti-bot of the family, usually answers with a captcha page (`bot-wall`) |
| `sogou` | Sogou | Free | Yes | Chinese web; `/link?url=…` signed redirects are resolved to the real URL (one `redirect: manual` hop, body discarded) |
| `wechat` | WeChat articles (Sogou) | Free | Yes | Public-account articles; the signed link is **single-use**, so prefetching burns it and lands on the anti-bot page — the original link is kept as-is |
| `toutiao` | Toutiao | Free | Yes | Reads `article_url` out of the embedded JSON; heavily aggregated, so verify conclusions a second time |

- **The default engine is picked automatically**: when `provider` is left empty the plugin probes the egress region once - mainland China gets `bing` (no proxy needed), everywhere else gets `parallel` (the keyless official MCP, which hits official documentation more often). A failed probe falls back to `bing`. Set `DSH_FREE_SEARCH_DEFAULT=bing` or `=parallel` to override, and any engine picked in the settings page wins.
- **Auto-failover**: any engine failure (rate-limited free engine, or missing/invalid paid key, network error) automatically tries the next engine — the configured engine first, then other engines (exa/tavily/keenable/firecrawl/parallel/you are tried even without a key because they have built-in keyless quota), then the remaining free engines (Bing/AnySearch etc.) — with a note attached to the results naming the engine that actually served them (e.g. `Note: perplexity unavailable or failed, using exa.`). Search never fails outright because of engine issues.
- **Official Links in Settings**: Free engines display "Visit Website →", while paid engines display "Get API Key →" (opens in a new tab):
  - Exa: <https://dashboard.exa.ai/api-keys>
  - Tavily: <https://app.tavily.com/home>
  - Keenable: <https://keenable.ai/login>
  - Parallel: <https://platform.parallel.ai>
  - Brave: <https://api-dashboard.search.brave.com> (API docs: <https://api-dashboard.search.brave.com/app/documentation>)
  - Zhipu: <https://bigmodel.cn/apikey/platform> (API docs: <https://docs.bigmodel.cn/cn/guide/tools/web-search>)
  - Perplexity: <https://www.perplexity.ai/settings/api>
  - SerpBase: <https://serpbase.dev>
  - Serply: <https://serply.io> (API docs: <https://serply.io/docs>)
  - Outcrawl: <https://outcrawl.ai> (API docs: <https://outcrawl.ai/docs>)
  - SpecStream: <https://specstream.ai/signup?src=dsh-free-search> (API docs: <https://specstream.ai/agents.md>; `?src=dsh-free-search` is a source-attribution parameter only, with no referral or affiliate payment)
  - DeepSeek: <https://platform.deepseek.com/api_keys>
  - Doubao / Volcano Web Search: <https://console.volcengine.com/search-infinity/web-search>
  - You.com: <https://you.com/platform/api-keys>

#### Engine quota tiers
#### Why are some engines free?

The free/paid binary is not what decides **who belongs in a default pool** — the real constraint is the quota model: is there a free allowance, how much, and what happens past it. Five tiers (pick concurrent pools from these, so a full-pool run does not silently multiply quota):

| Tier | Engines | Past the allowance |
|---|---|---|
| ① Unlimited, no key | `ddg` / `ddg-lite` / `bing` / `searxng` / `anysearch` | — |
| ② Anonymous quota (runs without a key) | `exa` / `tavily` / `keenable` / `firecrawl` / `parallel` / `you` (100/day) | key raises the quota |
| ③ Free quota (key required) | `zhihu_global` / `zhihu_site` (5,000/day trial), `doubao` (500/month), `baidu` (50/day), `aliyun` (200-call starter pack), `brave` ($5/month credit ≈ 1,000 queries) | pay-as-you-go |
| ④ Paid upgrade (needs a key to return anything) | `serpbase` (100 free on signup) / `serply` (2,500 for 30 days) / `outcrawl` (1,000 credits a month) / `specstream` (explicit-only) / `perplexity` / `deepseek-official` / `deepseek-tools` / `kimi` | per call / per query |
| ⑤ Per-call billing (model built-in, explicit-only) | `openai` / `gemini` / `claude` | per token + per search |

Rule of thumb for a default pool: **① as the floor + ③ as the workhorse**; ② is allowed but remember it burns anonymous quota; ④ only when you actually want that source; ⑤ never enters a pool. Per-engine facts and a default-pool proposal live in [docs/engine-quota-tiers.md](./docs/engine-quota-tiers.md).

#### Why do some engines not need a key?

- **AnySearch**: its `v1/search` REST endpoint provides anonymous public search quota without registration or an API key. Quota is rate-limited (fine for daily queries), but as one of the free engines with mutual fallback it stays reliable.
- **Exa**: its public MCP endpoint (`mcp.exa.ai/mcp`) supports anonymous requests, so it works without a key; configuring `EXA_API_KEY` grants a higher usage quota.
- **Tavily**: offers keyless anonymous quota via the `x-tavily-access-mode: keyless` header — it works without a key; configuring `TAVILY_API_KEY` switches to the account tier for higher quota and more stable results.
- **Keenable**: without a key it is called via its public MCP endpoint (`api.keenable.ai/mcp`); configuring `KEENABLE_API_KEY` switches to the REST API (`api.keenable.ai/v1/search`) for higher quota and organization-scoped rate limits.
- **Firecrawl**: its `/v2/search` endpoint works **without a key** out of the box (the official docs state "No API key needed to get started", with anonymous rate limits); configuring `FIRECRAWL_API_KEY` raises the limits. Supports `tbs` time filtering (`qdr:h/d/w/m/y` and custom date ranges).
- **You.com**: without a key it calls the official keyless tier (`api.you.com/v1/agents/search`), 100 free searches a day with no signup; setting `YDC_API_KEY` (the old `YOUCOM_API_KEY` name still works) switches to the Search API (`ydc-index.io/v1/search`) for higher limits.

### Installation

Requires **DSH 0.2.1-rc.2 through 0.3.x** (`engines.dsh` = `>=0.2.1-rc.2 <0.4.0-0`, declared at both the top-level `engines.dsh` and `dsh.engines.dsh` so the install gate and the community market read one range); older 0.1.x hosts and 0.4+ hosts do not satisfy it and the plugin manager refuses the install. Verified on 0.2.2-rc.1 (the runtime inside DSH Desktop 2.0.22-next) and 0.2.2-rc.3.

```sh
git clone https://github.com/DDDMUC/dsh-free-search.git
dsh plugin --profile web add /path/to/dsh-free-search
```

Then restart:

```sh
dsh web
```

#### Takeover behavior and verification

The plugin **takes over search** once loaded:

- When `web.searchProvider` is unset, or still the shipped default for the running DSH (`deepseek-search-api` since 0.2.2-rc.2, `deepseek-official` on older hosts), it switches to this plugin's provider (id: `ddg`);
- If you (or another plugin) explicitly selected a different provider, it does not steal it — it only logs a WARN with a copy-pasteable YAML snippet.

**The takeover is persisted into the profile (DSH 0.2.x).** Since `0.2.0-rc.2` the provider selection lives in volatile config refs and can only be written through `settings.mutate("web", …)`, which lands in `profiles/<profile>/cordis.patch.yml` as:

```yaml
- id: web
  config:
    searchProvider: ddg
    fetchProvider: fs-quality-fetch
```

So **remove those `- id: web` lines before disabling or uninstalling this plugin** (or delete the whole row and let DSH fall back to its defaults). Otherwise the config still points at `ddg` while nothing registers it, and every search fails with:

```
Error: configured web provider "ddg" is not registered
```

Older DSH (0.1.x) used a static patch layer for this; writing that row by hand there is neither needed nor recommended.

#### DSH's "DeepSeek search API" switch

DSH 0.2.1 has Settings → Web search → **DeepSeek search API**, which interacts with this plugin:

| Action | Result |
|---|---|
| Turn the switch on | `web.searchProvider` becomes `deepseek-search-api` (an explicit choice), so **this plugin steps aside** and search goes through the official direct API; fetch becomes `deepseek-fetch-api` as well |
| Turn the switch off | DSH deletes the whole `- id: web` row, so the provider falls back to the shipped default for the running DSH: `deepseek-search-api` since 0.2.2-rc.2 (billed per Search API call), or `deepseek-official` on older hosts (model search: a full auxiliary request, billed per token). Neither is a free engine |
| After turning it off | **Since 0.9.8**: the plugin notices either official default and re-takes at runtime (log line `DSH's search switch put the web providers back to the official defaults — re-took …`), normally within seconds; if it does not, restart DSH |

While the switch is on, `fetchProvider` stays at `deepseek-fetch-api`, so `web_fetch` keeps going through the paid official API and none of the `fs-quality-fetch` tiers (direct / browser / exa / firecrawl) run — the error text comes from DeepSeek and never mentions the plugin. That is the plugin stepping aside on purpose, not an upstream outage. To keep official search and the plugin's fetch chain at the same time, turn on **Force the web_fetch takeover** in this plugin's settings (writes `fetchProviderForce: true`); saving applies immediately, no restart. Setting `fetchProvider: fs-quality-fetch` by hand does the same.

Use `/free-search-engine` or this plugin's settings page to change engines, **not that switch**. Turning it on and then off drops you from the official direct API back to model search until the plugin re-takes over or DSH restarts.

> If you hand-wrote `- id: web` back in the 0.1.x era, you can drop it now: 0.2.x writes it at runtime. If you do declare it by hand, `fetchProvider` should be `fs-quality-fetch` (the fetch provider this plugin registers), not `http`.

- `searchProvider: ddg` — this plugin's **fixed provider id**, not "use the DuckDuckGo engine"; the engine is chosen by the `provider` field in settings (`bing` / `baidu` / `auto` / …).
- `fetchProvider: fs-quality-fetch` — this plugin's fetch provider (direct → exa contents → firecrawl → crawl4ai).
- To go back to official search: click Restore official search in the Fetch section, or **remove those `- id: web` lines first, then disable this plugin** in the plugin manager.

#### Dependency Note

This plugin intentionally specifies `@deepseek-ai/dsh-settings` and `@deepseek-ai/dsh-tools` as `peerDependencies`: the DSH runtime must use a single instance from the installation tree. Always install the plugin using `dsh plugin --profile <profile> add ...`. Do **not** copy DSH core packages into a profile-local `node_modules`, as duplicate copies can break the tool scheduler.

### Usage

#### Web Settings (Recommended)

After installation, open the config page (DSH 0.2.1-rc.2+):

- Sidebar **Plugins** page → **Installed** group → `free-search` → click the `web-search-free` component row (the row's "configure" entry)

The config page provides:

- **Search engine**: Select an engine from the dropdown; changes take effect immediately upon saving.
- **API keys**: Enter keys for Exa / Tavily / Keenable / Firecrawl / Parallel / Perplexity / DeepSeek / Google CSE / Metaso / Yandex / Yuanbao / SpecStream / You.com (password fields; displayed as "configured" once saved; Exa / Tavily / Keenable / Firecrawl / Parallel / You.com work without a key too).
  - **Recommended**: store paid-engine keys in the harness credential center `~/.dsh/.credentials.yaml` (e.g. `DEEPSEEK_API_KEY: sk-...`, same as the official LLM providers — one place for all keys). Resolution order: credentials center > settings page > environment variable; the settings-page fields remain for backward compatibility.
- **Test engine**: Tests the selected engine directly (no fallback chain; paid engines without a key report an explicit error).
- **Use Bing default**: stage a switch back to the stable free Bing engine; `Discard` only cancels unsaved edits
- **Platform search**: check platforms (GitHub / V2EX / Bilibili / Reddit / HN / Stack Overflow / Wikipedia / npm / YouTube / Vimeo / Juejin / Douban / Qiita / X (Twitter)) to enable them for the `platform_search` tool (unchecked platforms are skipped, and X needs Grok Build signed in).
- **Interface language**: choose Follow app, English, or 中文. Missing, empty, or `auto` `uiLang` follows the current DSH locale reactively; explicit `en` / `zh` stays fixed. Unsaved choices preview in the card; saving updates the sidebar, summaries, and slash commands, while Discard restores the saved choice. UI copy falls back to English for other languages, retaining the existing translated panel titles. Older hosts without a locale service use the browser language, then English. Search `lang`, Bing market, provider, and prompt language remain independent.

Locale regression fixture: `node tools/assert-ui-locale.mjs` renders the exported client bundle against offline settings and host-locale fixtures; it makes no provider requests.

<table align="center" style="border: none; border-collapse: collapse;">
  <tr style="border: none;">
    <td align="center" width="50%" style="border: none; padding: 6px;">
      <a href="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-engines.png">
        <img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-engines.png" alt="Engines and whitelist" width="100%" />
      </a>
      <br>
      <sub>▲ <b>Engines and whitelist</b> (green FREE / orange API KEY badges)</sub>
    </td>
    <td align="center" width="50%" style="border: none; padding: 6px;">
      <a href="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-apikeys.png">
        <img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/ui-apikeys.png" alt="Fallback priority and API keys" width="100%" />
      </a>
      <br>
      <sub>▲ <b>Fallback priority and API keys</b> (one row per engine, masked once configured)</sub>
    </td>
  </tr>
</table>

#### Switching Engines from the Chat (/free-search-engine)

You can also switch the engine right from the chat — no need to open the settings page. Type `/free-search-engine`: a **picker opens with all engines** (the same interaction as `/model` for selecting a model). Click one to switch; the current engine is marked. Equivalent to switching and saving in the settings page, and the language follows the settings page (Chinese/English).

The command only changes the preferred engine; search still goes through `web_search` + the unified fallback chain — even if the preferred engine fails, it automatically switches to others, never failing outright. The system prompt refreshes accordingly.

#### Engine Switches, Fallback Priority and Multi Mode

The settings page has these blocks (all saved into the entry config):

- **Globally enabled engines**: unchecking an engine excludes it everywhere — the web_search fallback chain, Auto routing, `advanced_search`, `multi_search` and engine tests. At least one engine must remain enabled.
- **Global fallback priority**: use ↑↓ to reorder. The preferred engine is still tried first; Auto keeps its language/time routing, while a customized order governs engines inside a route group and the remaining fallback chain. Disabled engines stay in the list (marked "disabled") but are skipped; "Reset default order" restores the defaults.
- **Chinese query pool (zhPool) / English query pool (enPool)**: the route head for Auto and the concurrent pool for Multi. Picked automatically by query language (CJK scripts go to the zh pool, everything else to en). Both pools support ↑↓ reordering, adding engines from a dropdown and removing with "−" (**minimum 2 engines per pool, no upper limit**). Defaults: zh `bing / baidu / aliyun / anysearch`, en `bing / exa / tavily`; disabled/cooling/keyless engines are skipped at runtime.
- **`Multi Search` in the engine dropdown**: web_search then queries **every enabled engine of the query's language pool** concurrently (no longer top 3), merges/deduplicates URLs and prioritizes cross-source hits. Running a whole pool multiplies quota usage (mind engines billed per credit); if a multi run fails it automatically falls back to the single-engine chain and says so in the result note.

#### Failure-aware fallback

The fallback chain no longer treats every failure the same way — it classifies them first (issue #36):

- **`quota`** (HTTP 402 / `NO_MORE_CREDITS` / SerpBase free quota exhausted): fail over immediately and put the engine on a **process-wide cooldown**, so later searches stop hammering an engine that cannot succeed;
- **`auth`** (401/403, invalid or missing key): same — cooled for the rest of the session (reload the plugin after fixing the key);
- **`bot-wall`** (e.g. the DDG anti-bot challenge): cools down for a short while (60s by default), then rejoins the chain;
- **`transient`** (timeout / 5xx / network / 429 rate limit): the engine is **retried once** before advancing, so a single blip does not drop a good engine;
- **`invalid-response`** (parse failure / schema change / 0 results): still fails over, but is reported as a plugin-side issue and does not cool the engine down.

The `Note:` line now names the class, e.g. `Note: exa is out of quota, using doubao.`, `Note: perplexity is misconfigured (API key rejected), using doubao.`, `Note: bing failed (transient), using doubao.`. `free_search_test` also reports the class per failed engine (`failureClass`).

Cooldowns are per-process (reloading the plugin or restarting clears them) and apply to the configured preferred engine too: if it is cooling down, this run skips it, fails over and says `is cooling down`. An engine that succeeds is automatically un-cooled.

`fallbackOn` decides which failure classes are **allowed** to trigger a fallback: by default all six are checked, i.e. today's "search never fails outright". Unchecking a class makes such a failure **stop the search and surface that engine's error** instead of trying another engine (e.g. drop `invalid-response` and a preferred engine that returns nothing/parses badly fails loudly rather than silently handing you a lower-quality engine's results). An empty array `[]` aborts on any failure. Note that **missing keys, disabled engines and unsupported time filters are not failures** and always advance. There is a matching checkbox group in the settings page, and you can also write `fallbackOn: [quota, auth, bot-wall, transient, invalid-response, unknown]` in the config.

#### Safe Search (`safeSearch`)

`safeSearch` controls whether the built-in sources apply an extra safety filter. Default is `off` (no parameter is added — each engine keeps its own default):

| Value | Meaning |
|---|---|
| `off` (default) | no filter parameter; engine default behavior |
| `moderate` | filter adult content |
| `strict` | strictest filtering |

It applies to **Bing** (`adlt`), **DuckDuckGo HTML** (`adlt`), and **DuckDuckGo Lite** (`adlt`). Other engines have no such parameter and are unaffected. There is a dropdown in the settings page; you can also write `safeSearch: moderate` in the config.

#### Fetch provider takeover (conflicts with other fetch plugins)

At runtime the plugin tries to take over `web.fetchProvider`:

- unset, or still the factory default `http` → taken over as `fs-quality-fetch` (direct → exa contents → firecrawl → crawl4ai);
- **explicitly pointed at another provider** (e.g. `playwright`) → **not stolen**, one log line only (once per process).

If you also run a plugin that registers a fetch provider (`dsh-web-fetch-playwright`, `dsh-chatgpt-subscription`, …), **make one of them step aside** in the profile's `cordis.patch.yml`:

```yaml
- id: web
  config:
    fetchProvider: playwright   # use theirs; this plugin only takes over search
```

Otherwise startup can loop on "write the `web` config → the web service rebuilds → the plugin re-applies" (see issue #82).

If you deliberately pinned `fetchProvider: http` (you only want the built-in fetcher), set `fetchProviderTakeover: false`: `http` is no longer treated as the factory default, while a completely unset provider is still filled in.

DSH's search switch writes `fetchProvider: deepseek-fetch-api`, and the plugin steps aside for that too. To take fetch back without editing YAML, turn on `fetchProviderForce` ("Force the web_fetch takeover" in the settings page's fetch section): it ignores the rule above and writes `web.fetchProvider` back to `fs-quality-fetch` as soon as the setting is saved.

`searchProvider` follows the same rule: taken over when unset or still the running host's official default (`deepseek-search-api` / `deepseek-official`), never when explicitly pointed elsewhere.

#### Configuration File

Since DSH 0.1.7-rc.1 (the current release line requires 0.2.1-rc.2+) the configuration is stored with the profile's plugin entry: the settings page and `/free-search-engine` both write the `config` of the `web-search-free` (`dsh-free-search`) entry in the active profile's `cordis.patch.yml`.

The old `free-search:` section of `~/.dsh/settings.yaml` is **not** imported by the DSH core (`importLegacyDocument` only maps `ui-developer-tools` / `ui-onboarding` / `shell`); the file is renamed to `settings.yaml.imported` after the other sections are imported, and the section's values stay there. The plugin detects that section in `settings.yaml.imported` (or in a still-present `settings.yaml`) at startup and seeds the recognized fields into this entry's `config` **once** (watch for `free-search: migrated N field(s)…` in the startup log). You can also migrate manually by copying the values from `settings.yaml.imported` into the plugin row config.

```yaml
# config of that entry in profiles/<profile>/cordis.patch.yml:
provider:                   # empty = geo default (NOT Auto routing; bing on a mainland egress, parallel elsewhere); or ddg / bing / auto / multi
fallbackOn: [quota, auth, bot-wall, transient, invalid-response, unknown]   # failure classes allowed to trigger fallback; [] = abort on any failure (default: all)
lang: zh                    # search language pools / localization (zh / en / ru …; no longer rewritten by the settings page)
#   lang drives Bing's mkt/Accept-Language, the Wikipedia subdomain (ja → ja.wikipedia.org) and the geocoding language;
#   text this plugin renders itself only exists in Chinese and English, so other languages (ja/ru/de…) get English rather than a wall of Chinese (#92);
#   weather also has Japanese (ja gets Japanese weather text, ru/de… still get English).
#   web_fetch (fs-quality-fetch) sends the same Accept-Language instead of a fixed Chinese one (#92).
uiLang: ""                  # UI language (zh / en); missing, empty or auto = follow DSH locale
promptLanguage: en          # language of the system prompt section and tool descriptions (en / zh); prose only - tool names, params and enums stay English
# The prompt has three segments: state, tools, constraints. In each one page 1 is the
# built-in English page and page 2 the built-in Chinese one (neither is stored);
# page 3 onwards is yours.
promptStatePages: []
promptStateIndex: 0
promptToolsPages: []
promptToolsIndex: 0
promptConstraintsPages: []
promptConstraintsIndex: 0
disabledTools: []           # tools that are not registered at all (e.g. [domain_search]); their schemas leave the context too
bingMarket: zh-CN           # Bing market; empty = automatic (no mkt sent)
fetchProviderTakeover: true # false = keep the fetchProvider: http you pinned yourself
fetchProviderForce: false # true = also take over the deepseek-fetch-api written by DSH's search switch (#142)
browserFetch: true           # use the system browser headless renderer when direct fetch fails
allowFakeIpCidrs: []          # reserved ranges to allow explicitly, e.g. 198.18.0.0/15 for Clash/mihomo fake-ip
fetchPrefer: exa             # exa | firecrawl — which keyed fetch tier to try first
region: cn-zh               # DuckDuckGo region (optional)
searxngInstances:           # Custom SearXNG instances (optional)
  - https://your-instance.example
searxngBearerToken: ...      # Optional: send Authorization: Bearer <token> (same as the "SearXNG Bearer Token" row in the settings UI)
degoogInstances:           # Self-hosted degoog instances (optional, e.g. https://search.example.com)
  - https://search.example.com
degoogApiKey: ...          # Optional: bearer key, only when your instance enables API keys
safeSearch: off              # Safe search: off (default) / moderate / strict; applies to bing / ddg / ddg-lite
blockedDomains:              # Domain blocklist (optional): matching domains never enter the results
  - spam-example.com
allowedEngines: [...ALL]      # The only enable list; defaults to all current engines, new engines need manual opt-in
multiMaxEngines: 0           # multi concurrency cap (0 = unlimited, whole language pool); the settings UI has Fast/Balanced/Deep presets
multiMinSources: 1           # multi target source count (only triggers top-up runs; not a hard minimum)
multiMaxResults: 20          # ceiling for unique results after merge (1-100)
exaApiKey: ...              # Or configure via the web settings UI
tavilyApiKey: ...           # Or configure via the web settings UI
keenableApiKey: ...         # Or configure via the web settings UI
firecrawlApiKey: ...        # Or configure via the web settings UI
parallelApiKey: ...         # Or configure via the web settings UI
perplexityApiKey: ...
serpbaseApiKey: ...         # Or configure via the web settings UI
serplyApiKey: ...           # Or configure via the web settings UI
outcrawlApiKey: ...         # Or configure via the web settings UI
specstreamApiKey: ...       # Or configure via the web settings UI
googleCseApiKey: ...        # Google Custom Search API key
googleCseId: "..."         # Programmable Search Engine cx
metasoApiKey: ...          # Metaso API key (metaso.cn/api)
metasoScope: webpage       # webpage | document | scholar
yandexApiKey: ...          # Yandex Search API key (AI Studio)
yandexFolderId: "..."      # folder the key was created in
yandexSearchType: auto     # auto | ru | tr | com | kk | be | uz
deepseekApiKey: ...
deepseekToolsApiKey: ...   # optional key for the custom endpoint
deepseekToolsBaseUrl: ""    # custom /v1/tools/search endpoint or base; empty = api.deepseek.com
```

#### Asking the Agent to Test All Engines

Tell the agent *"Test all search engines"*, and it will call the `free_search_test` tool to check each engine sequentially and report back:

```
Search engine test:
- ddg: FAIL - DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary) - Bing works
- bing: OK (2 results, e.g. "DeepSeek Harness developer preview...")
- exa: FAIL - EXA_API_KEY not configured
```

#### Time Filtering (`advanced_search`)

Ask the agent for *"news from the last week"*, *"releases this month"*, *"updates from the last 3 days"*, or *"posts since July"*, and it will call the `advanced_search` tool with a `timeRange` parameter. It uses the same unified fallback chain, can force a specific `engine`, and returns the same shape as `web_search`.

**The `timeRange` parameter accepts three forms:**

| Form | Example | Meaning |
|---|---|---|
| Fixed tier | `day` / `week` / `month` / `year` | = 1 / 7 / 30 / 365 days |
| Custom relative | `12h`, `3d`, `2mo`, `1y` | last 12 hours / 3 days / 2 months / 1 year |
| Absolute date | `2026-07-01` | results published on or after that date |

**How each engine handles `timeRange`:**

| Engine | Parameter | Precise? | Notes |
|---|---|---|---|
| Exa | `startPublishedDate` | ✅ precise | custom days become an ISO date (N days ago); absolute dates pass through |
| Keenable | `published_after` | ✅ precise | relative values (`12h/3d/2mo/1y`) and absolute dates pass through |
| Tavily | `time_range` | ⚠️ approximate | only fixed tiers; custom days map to the nearest tier |
| Firecrawl | `tbs` | ⚠️ approximate | fixed tiers map to `qdr:d/w/m/y`; absolute dates use `cdr:1,cd_min:M/D/YYYY` (precise) |
| Parallel | `source_policy.after_date` with a key (precise); without a key the MCP path has no date parameter, so the window is written into the objective as a freshness hint (soft filter) | ✅ precise / ⚠️ soft | custom days become an ISO date (N days ago); absolute dates pass through |
| SearXNG | `time_range` | ⚠️ approximate | same as above |
| DuckDuckGo / Lite | `df` | ⚠️ approximate | same as above |
| Bing / AnySearch | — | ❌ ignored | no corresponding parameter |
| DeepSeek Native Search (`deepseek-tools`) | `after:` query syntax | ✅ precise | the endpoint has no dedicated date field, so `after:YYYY-MM-DD` is appended to the query; relative day counts are converted to an N-days-ago date |

**Nearest-tier mapping rule**: `≤2 days → day`, `≤14 days → week`, `≤90 days → month`, otherwise `year`. For example, `3d` becomes `day` on Tavily, and `2mo` becomes `month`.

**Engine-chain priority**: when a `timeRange` is present, engines that support time filtering (tavily / exa / keenable / firecrawl / parallel / searxng / ddg / ddg-lite / deepseek-tools) are moved to the front of the fallback chain, so the filter actually takes effect — even if the preferred engine is bing (which does not support filtering), a filtering-capable engine is tried first.

Example: *"Find DSH news from the last 3 days"* → agent calls `advanced_search` with `timeRange: "3d"`.

#### Multi-Engine Concurrent Search (`multi_search`)

When you need **cross-source verification** to prevent biases or fail-safes from a single engine, the agent can call `multi_search`:

- **Concurrent Execution**: Defaults to querying **every engine of the query's language pool** (no longer top 3; or an explicit list passed via `engines`). Each engine independently resolves API keys and handles errors (missing keys are skipped without failing the batch).
- **Three presets** (radio buttons in the settings UI; the choice is written to the config immediately):

  | Preset | Concurrency cap | Target sources |
  |---|---|---|
  | `Fast · 1/1` | 1 | 1 |
  | `Balanced · 3/1` | 3 | 1 |
  | `Deep · 6/2` | 6 | 2 |

  Typing your own numbers below the buttons counts as "custom" and no preset appears selected.
- **Concurrency cap** (`multiMaxEngines`, default `0` = **unlimited**, the whole language pool): this is a **ceiling, not a floor** — the actual fan-out is `min(cap, credential-eligible engines)`. Credential eligibility is resolved **before** truncation, so keyless engines never occupy slots (3 eligible engines with a cap of 6 still run all 3).
- **Target source count** (`multiMinSources`, default `1`): **not a hard minimum**. It only triggers top-up runs — when too few sources have returned, the remaining eligible engines run **serially** in domain round-robin order; once they are exhausted or time runs out, the results in hand are returned (coming up short is not an error).
- **30-second total budget** (`SEARCH_BUDGET_MS`): the fan-out and every top-up run share one deadline; at expiry the plugin stops and returns **whatever it already has**, so one slow engine cannot stall the whole search.
- **Deduplication & Merge**: Normalizes URLs (drops trailing slashes and audited tracking params) and ranks items by the number of engines that found them (`seenIn` counts), with cross-hit results placed at the top; **same-site detection uses eTLD+1** — `a.example.co.uk` and `b.example.co.uk` count as one site, so domain-diversity rotation happens at the **site** level and cannot be flooded by many subdomains.
- **Untrusted Boundary**: Enforces the `<untrusted-web-content>` safety wrapper and trims snippets.
- ⚠️ Note: Running multiple engines in parallel consumes more search quota; use on demand when high source diversity is needed.

#### Output contract (meta.uncertainty)

`advanced_search` and `multi_search` now return an optional `meta.uncertainty` field describing how much the result should be trusted; the existing `provider` / `content` / `sources` shape is unchanged:

```json
{ "provider": "multi", "sources": [ ... ],
  "meta": { "uncertainty": { "level": "medium", "notes": ["only two sources"] } } }
```

- `level`: `high` / `medium` / `low`, derived from the number of sources, whether they all come from one site, a time filter without publish dates, aggregator hosts, and whether any engine failed;
- `notes`: readable reasons; usually empty at `high`;
- the rendered text appends a `Confidence: …` line whenever the level is not `high`.

This is the **small step**: additive fields only, existing parsers keep working.
#### Fetch Webpage Content (`web_fetch`)

After searching, the agent can **read full webpage content** (e.g., *"Open the first link and summarize it"*). The `web_fetch` tool is enabled by default (official `dsh-web-fetch-http` provider):

- Automatically follows redirects and decodes HTML to plain text.
- Supports timeout and response size limits.
- ⚠️ Note: `web_fetch` rejects loopback, private, link-local and cloud-metadata addresses by default. Under Clash / mihomo TUN fake-ip DNS, add the fake-ip range (usually `198.18.0.0/15`) to extra allowed networks in Settings, otherwise every proxied host resolves to a placeholder address and is rejected; only allow the fake-ip ranges, never RFC1918; IPv6 fake-ip often uses a ULA such as `fdfe:dcba:9876::/64`, which must be listed explicitly.

#### MCP server (stdio)

The repo also ships a standalone stdio MCP server for Claude Desktop, Cursor, Codex and other MCP clients; it does not need the DSH runtime:

```bash
npx -y -p dsh-free-search dsh-free-search-mcp
```

`web_search` auto-runs only the keyless Bing / DuckDuckGo engines; a keyed engine (`google` / `baidu` / `brave` / `metaso` / `yandex` / `yuanbao` / `deepseek-tools` / `zhipu` / `perplexity` / `serpbase` / `serply` / `outcrawl` / `tinyfish` / `jina` / `kimi` / `aliyun` / `doubao` / `zhihu_global` / `zhihu_site` / `specstream` / `deepseek-official` / `openai` / `gemini` / `claude` / `agy`) runs only when named in the argument or `MCP_SEARCH_ENGINE`; `anysearch` / `searxng` / `exa` / `tavily` / `keenable` / `firecrawl` / `parallel` / `you` can also be named explicitly and have keyless tiers; `degoog` needs `MCP_DEGOOG_INSTANCES`; `baidu-html` / `so360` / `sogou` / `wechat` / `toutiao` are opt-in HTML SERP scrapers. It supports `time_range` (day/week/month/year). `advanced_search` is a compatibility alias over the same backend for hosts that call that tool name. `web_fetch` still uses direct / browser / Exa / Firecrawl. `multi_search` merges several engines in parallel (free engines by default), `domain_search` queries structured package/paper/CVE/filing/finance/law sources, `platform_search` queries GitHub/HN/Reddit/npm/Wikipedia/Bilibili/V2EX/Juejin/Douban/Qiita/YouTube/Vimeo/X, `video_search` queries Bing/DDG videos, `research` runs a lightweight multi-engine search + fetch + evidence brief, `cache_search` searches the local research cache, `free_search_test` probes engines, `doctor` reports local config/credentials, and `weather` returns a 1-7 day forecast; the server does not listen on a port. Claude Desktop example:

```json
{
  "mcpServers": {
    "dsh-free-search": {
      "command": "npx",
      "args": ["-y", "-p", "dsh-free-search", "dsh-free-search-mcp"],
      "env": { "MCP_LANG": "zh", "MCP_SEARCH_ENGINE": "auto" }
    }
  }
}
```

Environment: `MCP_SEARCH_ENGINE` (auto by default, or any explicit engine id), `MCP_MAX_RESULTS`, `MCP_SAFE_SEARCH`, `MCP_LANG`, `MCP_BING_MARKET`, `MCP_BROWSER_FETCH`, `MCP_ALLOW_FAKE_IP_CIDRS`, `MCP_DEEPSEEK_FETCH_URL`, `MCP_MAX_RESPONSE_CHARS` / `MCP_MAX_RESPONSE_BYTES`. Keyed/optional engines read their own env: `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID`, `BAIDU_API_KEY`, `BRAVE_API_KEY`, `METASO_API_KEY` / `MCP_METASO_SCOPE`, `YANDEX_API_KEY` + `YANDEX_FOLDER_ID`, `TENCENTCLOUD_WSA_APIKEY` / `MCP_YUANBAO_MODE` / `MCP_YUANBAO_SITE`, `DEEPSEEK_TOOLS_API_KEY` or `DEEPSEEK_API_KEY`, `ZHIPU_API_KEY` / `MCP_ZHIPU_SEARCH_ENGINE`; keyless-capable engines can use `ANYSEARCH_API_KEY`, `MCP_SEARXNG_INSTANCES` / `MCP_SEARXNG_BEARER_TOKEN`, `EXA_API_KEY`, `TAVILY_API_KEY`, `KEENABLE_API_KEY`, `FIRECRAWL_API_KEY`, `PARALLEL_API_KEY`, `YDC_API_KEY` (the old `YOUCOM_API_KEY` alias also works).

#### Platform Search (`platform_search`)

Ask the agent to search specific platforms (e.g., *"Search GitHub for deepseek harness"*, *"Find related videos on Bilibili"*, or *"Discussions about dsh on V2EX"*). The `platform_search` tool supports:

| Platform | Purpose |
|---|---|
| `github` | GitHub repository search (public API, free, no key required) |
| `v2ex` | V2EX hot / relevant topics |
| `bilibili` | Bilibili video / content search (public API) |
| `reddit` | Reddit posts / discussions (public JSON API; may be blocked by Reddit anti-bot in some network environments) |
| `hn` | Hacker News tech community discussions (official Algolia API) |
| `stackoverflow` | Stack Overflow Q&A (official public Stack Exchange API) |
| `wikipedia` | Wikipedia articles (subdomain follows `lang`: zh → zh.wikipedia.org, ja → ja.wikipedia.org; unsupported languages fall back to en.wikipedia.org) |
| `npm` | npm package search (registry official API) |
| `youtube` | YouTube video search (scrapes the results page `ytInitialData`, keyless) |
| `vimeo` | Vimeo video search (scrapes the search page's embedded data; falls back to web search `site:vimeo.com`, keyless) |

These rely on public endpoints or keyless scraping, with zero external dependencies and no API keys. `youtube` / `vimeo` must first be enabled in Settings → Platform search.

#### Video Search (`video_search`)

Ask the agent to find videos: *"find some videos about X"*, *"any tutorials for Y"*. `video_search` searches across the web:

| Source | Notes |
|---|---|
| `bing` | Bing Videos (scrapes the `vrhm` metadata on `bing.com/videos/search`, keyless) |
| `ddg` | DuckDuckGo Videos (vqd + `v.js`, keyless) |

Both sources are tried by default with mutual fallback, returning `url / title / snippet` (publisher, duration, etc.). **Keyless scraping — may break if the site changes its markup**; to search a specific site (YouTube / Vimeo / Bilibili) use `platform_search`.

#### One-Call Research (`research`)

`research` gives the agent an evidence pack with provenance in a single call: concurrent multi-engine search → candidate rerank → tiered body fetch → window selection → Markdown brief. Use it when a question needs multi-source verification, instead of chaining `web_search` + `web_fetch` yourself.

- **Arguments**: `question` (the question itself) and `depth` (how many bodies to fetch in full, 1–5, default 3; rounded and clamped to that range).
- **Output**: `sources` (search hits), `documents` (fetched bodies, each with `kind`, `text_origin`, `tier`, `published`, `fetched_at`, `engine_hits` and more), `notes` (execution notes) and `estimatedTokens`.
- **Shared budget**: every stage shares a 90-second deadline (`DEADLINE_MS`) and a cap of 12 search calls (`SEARCH_REQUESTS_MAX`). When time is up, in-flight requests are cancelled, queued work does not start, and the partial results collected so far are returned with `deadline_hit` or `budget_exhausted` recorded in `notes`.
- **Degradation**: if rerank, embedding or the decision model fails, the chain silently falls back to the rule path and keeps going; when fetching fails it degrades to search snippets only (`snippets only`).
- **Untrusted boundary**: the returned brief is wrapped in `<untrusted-web-content>`.

Behavior without keys (**the basic path stays usable and never breaks over a missing key**):

| Key not configured | Effect |
|---|---|
| `SILICONFLOW_RERANK_API_KEY` | Candidate rerank and window model scoring are skipped in favor of light filtering; the pre-fetch semantic cluster tagging is skipped too. The fallback path is recorded in `notes` |
| `DECISION_MODEL_API_KEY` / `DECISION_MODEL_URL` | The decision model is fully off (`decide()` returns null immediately): intent judging, the sufficiency gate and rewrite picking all use the rule path. Both must be set for it to run |
| `EXA_API_KEY` / `FIRECRAWL_API_KEY` / `CRAWL4AI_API_KEY` | The corresponding tier of the fetch chain is skipped; the other tiers still run |

> The decision-model endpoint is **off by default** (`DECISION_MODEL_URL` defaults to an empty string): no third-party endpoint is called unless you configure one.

#### Search Fetched Bodies (`cache_search`)

`cache_search` full-text searches the bodies `research` already fetched, so you can look back at earlier findings without re-fetching.

- **Arguments**: `query` (text to look for) and `limit` (max entries, default 8, up to 20).
- **Returns**: `url` / `title` / `excerpt` / `fetched_at`, also wrapped in `<untrusted-web-content>`.
- **Where it lives, and how to clear it**: defaults to `~/.cache/dsh-free-search/research.db`; set `RESEARCH_CACHE_DIR` to relocate it (a backup drive, or wherever you want it to travel with). **To clear it**: delete that directory — there is no background job and nothing left in the registry. Entries expire after 7 days and are pruned lazily on query, so stale rows never reach your results.
- **`node:sqlite` unavailable**: when `node:sqlite` cannot be loaded, the cache is disabled entirely (no-op) — `research` still runs, `cache_search` returns an empty array, and the plugin never errors out over it. `node:sqlite` is unflagged from v22.13.0 / v23.4.0; 22.5–22.12 needs `--experimental-sqlite`, otherwise it takes the same no-op path.

### Local Engine Switcher (`tools/`)

The `tools/` directory includes a lightweight, zero-dependency switcher:

- **`启动搜索引擎切换器.cmd`** (Windows) — Double-click to launch a local Node server (`http://127.0.0.1:4789`) and automatically open the engine selector page in your browser.
- **`switch-engine.html`** — The selector UI: displays current engine status and allows one-click switching.
- **`server.mjs`** — The local backend service responsible for reading/writing `~/.dsh/profiles/web/cordis.patch.yml`.
- **`switch-engine.ps1`** — Headless PowerShell script: `powershell -File tools/switch-engine.ps1 -Engine bing`.

Restart `dsh web` after switching to apply changes.

#### Offline self-check assertions (`tools/`)

**One hundred and thirteen** zero-dependency assertion scripts ship with the repo (**1414 assertions** total)

| Script | Covers | Run (count) |
|---|---|---|
| `assert-auto-default.mjs` | Automatic default engine: the region decision when `provider` is empty (CN to bing, anything else to parallel), falling back to bing on a failed probe, the `DSH_FREE_SEARCH_DEFAULT` override, the prompt following it, and `effectiveProvider` reaching the panel | `node tools/assert-auto-default.mjs` (7) |
| `assert-serp-engines.mjs` | HTML SERP family: registry invariants, time-filter declarations, staying out of auto routing and the fallback chain, only joining when named in a pool, inline fixtures for the four parsers, anti-bot detection and text cleanup | `node tools/assert-serp-engines.mjs` (32) |
| `assert-engines.mjs` | engine registry / free-engine rule / language-pool routing / pool config fields / Zhihu URL utm stripping / `deepseek-tools` wiring and snippetCap widening / `outcrawl` and explicit-only `specstream` registration | `node tools/assert-engines.mjs` (89) |
| `assert-blocked-domains.mjs` | domain blocklist: parsing, matching, choke points, and byte-identical front/back-end sanitizing | `node tools/assert-blocked-domains.mjs` (69) |
| `assert-multi-policy.mjs` | multi execution policy: ceiling semantics / target-is-not-a-hard-minimum / credential eligibility before the ceiling / **Fast·Balanced·Deep presets** | `node tools/assert-multi-policy.mjs` (146) |
| `assert-multi-limit.mjs` | Multi result ceiling (#109): default 20 / hard max 100 / config normalisation, per-call maxResults clamped to the ceiling, tool copy and prompt state name the effective limit, settings field and save path | `node tools/assert-multi-limit.mjs` (6) |
| `assert-maintenance.mjs` | Maintenance surface: CI runs every assertion on Node 20/22/24 plus the packaging gate, the release script bumps / verifies / tags / can publish, and the restore-official-provider bridge and settings button are wired | `node tools/assert-maintenance.mjs` (4) |
| `assert-engine-modules.mjs` | Engine layout: module files exist and are imported, implementations have left index.js, the client engine ids match the server catalog, the catalog covers 42 engines with the right free/explicit flags, and index never reads an engine-private name | `node tools/assert-engine-modules.mjs` (6) |
| `assert-brave.mjs` | Brave Search: catalog / credential / settings wiring, request headers and count/freshness, error classification, HTML stripping, ISO date normalization, and the 15s budget | `node tools/assert-brave.mjs` (54) |
| `assert-sidebar-entry.mjs` | Sidebar entry (#129): `sidebarEntry` defaults on, settings load/save it, registration can be disposed/recreated, and `/free-search` opens the panel | `node tools/assert-sidebar-entry.mjs` (4) |
| `assert-slash-commands.mjs` | Slash-command switch: `slashCommands` defaults on, settings load/save it, both commands register/unregister from config, and the prompt stops naming `/free-search-engine` when off | `node tools/assert-slash-commands.mjs` (4) |
| `assert-keyless-first.mjs` | Keyless tier first: `keylessFirst` defaults off; when on, the keyless tier runs first and a rate limit, auth demand or network failure falls back to the key (which then rests the keyless tier), other failures leave the key alone, and no-key behaviour is unchanged; covers Tavily, Exa and multi mode | `node tools/assert-keyless-first.mjs` (13) |
| `assert-zhipu.mjs` | Zhipu Web Search: catalog/fallback wiring, auth and request engine/count/recency, Sogou count steps, response mapping, error classes, missing key | `node tools/assert-zhipu.mjs` (6) |
| `assert-deepseek-snippets.mjs` | deepseek-tools snippets: default 600, 0 disables the cap, total budget ceiling, short results survive, summary+snippet joining, and site labels | `node tools/assert-deepseek-snippets.mjs` (5) |
| `assert-deepseek-official.mjs` | DeepSeek Official: Anthropic Messages + deepseek_web_search, title/snippet/site_name/page_age mapping, citation fallback, source guard | `node tools/assert-deepseek-official.mjs` (4) |
| `assert-bing-relevance.mjs` | Bing relevance (#112): single-character CJK tokens removed, an unrelated substituted SERP rejected, genuinely relevant results accepted, a batch matching only a generic engine name rejected, one distinctive token covering half the query accepted, and explicit single-character/numeric behaviour | `node tools/assert-bing-relevance.mjs` (6) |
| `assert-relevance-pools.mjs` | Relevance guard and language pools (#132/#133): AnySearch drops an unrelated batch but keeps a matching one, the shared guard is used by anysearch/searxng/ddg/ddg-lite/degoog/keenable, doctor reports the geo default and warns about unused pools, and the cache key changes with zhPool/enPool | `node tools/assert-relevance-pools.mjs` (5) |
| `assert-quality.mjs` | Research evidence gate: 8 sources / 3 domains / 3 bodies / 2 dates is high, 3 / 2 / 1 is medium, a single source or a degraded note is low, an empty package is low, and research wires the gate into schema, output and brief | `node tools/assert-quality.mjs` (6) |
| `assert-dedupe.mjs` | Near-duplicate removal: identical text shares a MinHash signature, exact URLs and cross-site copies are dropped, different articles survive in order, the threshold is configurable, and both the provider and multi paths run it | `node tools/assert-dedupe.mjs` (6) |
| `assert-intent-routing.mjs` | Intent routing: the five domains plus general, stable preference reordering, Auto head follows the domain, a custom fallback order is never reordered, time filtering still applies, and the wiring | `node tools/assert-intent-routing.mjs` (6) |
| `assert-result-ranking.mjs` | merged ranking: **eTLD+1 same-site detection** / domain round-robin / `seenIn` demoted / freshness only under a time filter | `node tools/assert-result-ranking.mjs` (31) |
| `assert-url-norm.mjs` | URL normalization: strips only audited tracking params, keeps params that may identify different resources | `node tools/assert-url-norm.mjs` (72) |
| `assert-prompt-contract.mjs` | system-prompt contract: **search ≠ fetch**, untrusted-data boundary, model engines only when explicitly selected | `node tools/assert-prompt-contract.mjs` (9) |
| `assert-research-degradation.mjs` | research degrades fully without keys, `node:sqlite` no-op, 90s budget isolation, configurable cache dir, `budget.exhausted` contract names | `node tools/assert-research-degradation.mjs` (19) |
| `assert-research-call-wrappers.mjs` | the four research `call*` wrappers proxy to stubs / the real layer (#75 regression) | `node tools/assert-research-call-wrappers.mjs` (23) |
| `assert-fetch-chain.mjs` | `fs-quality-fetch` tier ordering, stop-on-first-success, silent firecrawl degradation, aggregated all-tiers failure | `node tools/assert-fetch-chain.mjs` (8) |
| `assert-fetch-ssrf.mjs` | Fetch SSRF guard: public/private/reserved address classification, DNS resolving to a private address rejected, localhost and IP literals rejected, `http://` accepted while other schemes and credential URLs are refused, an http host resolving to a private address rejected, fake-ip ranges blocked by default and allowed only when configured, IPv6 ULA allowed only when listed, loopback/IPv4-private/link-local still blocked after opt-in, provider wiring and settings | `node tools/assert-fetch-ssrf.mjs` (10) |
| `assert-fetch-http.mjs` | Plain-http targets (#143): the direct tier picks its transport per protocol, http redirects are followed, the provider no longer refuses http up front and lets the tier chain run, an all-tiers failure reports the direct error instead of an https-only assertion, other schemes still refused, `agentForUrl` hands http targets a plain tunnel agent, and an http page is fetched through a `CONNECT` tunnel | `node tools/assert-fetch-http.mjs` (7) |
| `assert-baidu.mjs` | Baidu Qianfan: key required, web_search first, 403 or results.code quota fallback to chat/completions (stream:false), no fallback on 401, combined error when both fail | `node tools/assert-baidu.mjs` (6) |
| `assert-deepseek-endpoint.mjs` | DeepSeek search endpoint: default URL, base/full-URL normalization, custom endpoint receives bearer/key/query, config and settings wiring | `node tools/assert-deepseek-endpoint.mjs` (4) |
| `assert-yuanbao.mjs` | key required, Bearer gateway and Query/Mode/Site/FromTime, natural and VR page parsing, date normalization, error classes, registration and explicit-only | `node tools/assert-yuanbao.mjs` (6) |
| `assert-yandex.mjs` | Yandex Search: key + folder required, Api-Key/body/grouping, searchType and period/family mapping, Base64 XML parsing and dates, error classes, registration and explicit-only | `node tools/assert-yandex.mjs` (6) |
| `assert-metaso.mjs` | Metaso search: key required, request body (q/scope/size/summary/raw/concise), summary and date mapping, document array, size clamp, invalid scope fallback, 401/402/429/400 error classes, registration and default-chain exclusion | `node tools/assert-metaso.mjs` (6) |
| `assert-google-cse.mjs` | Google Custom Search: key + ID required, request params (q/num/start/hl/safe/dateRestrict), result mapping with dates, pagination past ten results, 403/429/400 classification, time-range mapping, full registration | `node tools/assert-google-cse.mjs` (6) |
| `assert-engine-runtime.mjs` | Engine runtime: per-engine concurrency caps (2 normally, 1 for HTML SERP), queueing with abort cleanup, ok/empty/fail/average-latency stats, wiring on both the provider and runEngineTest paths, and stats in the doctor report | `node tools/assert-engine-runtime.mjs` (4) |
| `assert-single-fetch-layer.mjs` | exactly one fetch implementation repo-wide, one-way deps, seams owned by the right layer | `node tools/assert-single-fetch-layer.mjs` (22) |
| `assert-vertical.mjs` | `domain_search` registry of 41 engines, per-engine descriptions, unknown-engine errors, no research dependency | `node tools/assert-vertical.mjs` (8) |
| `assert-free-search-test-schema.mjs` | `free_search_test` output schema matches real output (incl. auto/multi virtual modes) | `node tools/assert-free-search-test-schema.mjs` (8) |
| `assert-weather-contract.mjs` | `weather` output schema contract (field pruning, English output, empty geocode throws) | `node tools/assert-weather-contract.mjs` (11) |
| `assert-killtree-win32.mjs` | Windows process-tree termination (#74): no longer relies on `taskkill` | `node tools/assert-killtree-win32.mjs` (8) |
| `assert-killtree-portable.mjs` | portable `killTree` contract | `node tools/assert-killtree-portable.mjs` (5) |
| `assert-parallel-mcp.mjs` | Parallel MCP engine: the 25 s timeout / caller abort covers the **body read**, shared SSE parser (notifications, multiline frames), six error paths, REST precise time filtering | `node tools/assert-parallel-mcp.mjs` (15) |
| `assert-output-language.mjs` | language branches (#92): `searchLanguage` passes zh/en/ja/ru/de/es/fr/ko through and falls back to en, `outputLanguage` only returns zh/en, weather text has zh/en/ja (WMO descriptions and body; others fall back to English), and both confidence and failure notes follow the language | `node tools/assert-output-language.mjs` (10) |
| `assert-uncertainty.mjs` | output contract: 0/1 source is low, two sources or a single site is medium, three distinct domains is high, time filter without dates, failure notes, aggregator caveat | `node tools/assert-uncertainty.mjs` (8) |
| `assert-youcom.mjs` | You.com keyless tier (#90): both URLs and headers, no `X-API-Key` without a key, the `YDC_API_KEY` alias, and 429/401/402/5xx classification | `node tools/assert-youcom.mjs` (23) |
| `assert-prompt-language.mjs` | Prompt language (en/zh): fallback rules, bilingual copy for all 9 tools, identifiers left untranslated, placeholder interpolation, and one re-registration per language change | `node tools/assert-prompt-language.mjs` (7) |
| `assert-tool-schema-size.mjs` | Tool schema budget (#94): one shared engine-id constant, no per-engine sentences in `domain_search`, the three schemas under 1.6k chars combined | `node tools/assert-tool-schema-size.mjs` (5) |
| `assert-config-seat.mjs` | Config entry point (#101): the card is registered on `plugins.bundle.config` (keyed by the package name, rendered on the bundle page) and on `plugins.row.config` (older entry), both sharing one renderer | `node tools/assert-config-seat.mjs` (4) |
| `assert-prompt-injection.mjs` | Paged prompt (#102): two built-in pages first, user pages after, the current page is what gets injected, an empty page injects nothing, the generated page split into State/Tools/Constraints blocks, built-ins delivered with describe instead of a second request, tool switches wired into every registrar, and the seventh section UI | `node tools/assert-prompt-injection.mjs` (15) |
| `assert-rail-section.mjs` | Machine-readable active section for the in-page rail: the card root's `data-dsh-fs-section` tracks `railActive`, the six section ids are fixed, and the scroll spy still updates it | `node tools/assert-rail-section.mjs` (4) |
| `assert-package-files.mjs` | Packaging gate (#97): after expanding `files`, every imported local module, the entry points and `cordis.patch.yml` must be published, and the `prepack` guard must be wired | `node tools/assert-package-files.mjs` (4) |
| `assert-key-rotation.mjs` | Multi-key rotation (#96): round-robin and peek, single keys never advancing, quota classification ahead of 429, the rotation-candidate set, and in-engine retries that keep multi-mode preflight from consuming keys | `node tools/assert-key-rotation.mjs` (7) |
| `assert-fetch-key-rotation.mjs` | `web_fetch` cloud tiers (#128): a quota-failed key is cooled and the next key is tried, non-rotation errors do not consume another key, no key means no request, the real provider retries exa after a 402, and Linux browser paths | `node tools/assert-fetch-key-rotation.mjs` (6) |
| `assert-x-platform.mjs` | X (Twitter) platform via the Grok Build CLI: availability, prompt guardrails, structuredOutput/text/raw JSON parsing, status-link filtering and caps, bilingual copy and panel defaults | `node tools/assert-x-platform.mjs` (8) |
| `assert-cooldown.mjs` | Cooldowns: Retry-After / reset hints win, failure classes (session / short / quota / monthly / region), stable distinct key fingerprints, store cool/remaining/clear, finite cooldowns survive a restart while session ones do not, per-key and per-engine state stay separate | `node tools/assert-cooldown.mjs` (6) |
| `assert-redact.mjs` | Error redaction: registered keys are scrubbed everywhere, `sk-` / Bearer / api_key / x-api-key shapes need no registration, ordinary text and short values are untouched, environment secrets are collected by name | `node tools/assert-redact.mjs` (4) |
| `assert-doctor.mjs` | Doctor report: duration formatting, version / Node / DSH home / effective default / prompt size header, a mark and reason per engine, cooldown reasons listed once, a warning when the prompt is not injected, and a warning when language pools are configured but cannot apply | `node tools/assert-doctor.mjs` (7) |
| `assert-agy.mjs` | Antigravity CLI: query / cap / JSON contract in the prompt, structuredOutput and response envelopes, upstream reason on non-SUCCESS, URL filtering and truncation, CLI flags, injected runner skips the PATH check | `node tools/assert-agy.mjs` (6) |
| `assert-allowed-engines.mjs` | Engine whitelist (#106): entries normalised, an empty list changes nothing, a non-empty list disables everything else (including future engines), explicit disables win, a typo does not brick search, whitelisted engines join the chain (HTML family / billed), Auto only routes allowed engines, the built-in prompt lists only them with a none fallback, and the schema defaults to empty | `node tools/assert-allowed-engines.mjs` (9) |
| `assert-host-compat.mjs` | Host compatibility declarations (0.9.51): top-level `engines.dsh` matches `dsh.engines.dsh`, covers 0.2.1-rc.2 through 0.3.x and rejects 0.1.x/0.4+, every `@deepseek-ai/dsh*` peer agrees with that line, the market's intersection matches the install gate, `dshReleases` lists the verified hosts, and the client version follows package.json | `node tools/assert-host-compat.mjs` (8) |
| `assert-updater.mjs` | Built-in updater: version comparison, registry probe (success / non-200 / network failure yields null), install-mode detection (a real install beats a link), the client button and bridge helper, both server routes with the pnpm upgrade command, and the card version matching package.json | `node tools/assert-updater.mjs` (9) |
| `assert-inject.mjs` | Older Cordis compatibility (#107): the static inject list declares web / settings / tools / systemPrompt, optional services are read through `ctx.get`, every property read on a callback context is declared, and dynamic dependency lists contain no unknown services | `node tools/assert-inject.mjs` (4) |
| `assert-safe-text.mjs` | UTF-16 truncation safety (#108): lone high/low surrogates replaced, valid pairs kept, code-point slicing never splits an emoji, `cleanSnippet`'s 300 boundary lands on a whole character, results/sources/errors sanitized, every web_fetch tier covered, plus source guards | `node tools/assert-safe-text.mjs` (9) |
| `assert-degoog.mjs` | degoog self-hosted instance (#85): `/api/search` URL normalisation, query encoding, `time`/`lang` parameters, registry placement, no credentials needed | `node tools/assert-degoog.mjs` (7) |
| `assert-multikey.mjs` | multi-key fields: a single key is unchanged, comma/semicolon/newline separate keys, blank entries are dropped, empty input yields none | `node tools/assert-multikey.mjs` (3) |
| `assert-firecrawl-keyless.mjs` | Firecrawl keyless egress refusal: only a 403 with the VPN/proxy wording counts, plain 403 and 401/429/500 do not, and the cooldown starts inactive | `node tools/assert-firecrawl-keyless.mjs` (5) |
| `assert-fetch-charset.mjs` | fetch encoding (#88): `charset=gbk` / `gb2312` decoded as declared, `<meta charset>` and the http-equiv form sniffed when the header omits it, UTF-8 by default, and an unknown label falls back to UTF-8 instead of throwing | `node tools/assert-fetch-charset.mjs` (6) |
| `assert-fetch-abort.mjs` | fetch interruption (#87): a compressed response cut mid-body rejects instead of hanging forever, identity truncation rejects too, abort breaks a stalled gzip stream, and complete responses plus redirects still work | `node tools/assert-fetch-abort.mjs` (6) |
| `assert-fetch-proxy.mjs` | proxy support for the fetch tiers: `http_proxy` / `https_proxy` / `all_proxy` / `no_proxy` parsing (either case, lowercase wins, empty means unset), `NO_PROXY` domain / `host:port` / `*` matching, loopback always direct, `socks5://` ignored, the `CONNECT` tunnel handshake and `Proxy-Authorization`, a refusing proxy and an early disconnect never hanging, the SSRF guard still applied to every redirect hop when an agent is in use, and `--proxy-server` for the browser tier | `node tools/assert-fetch-proxy.mjs` (12) |
| `assert-bridge-access.mjs` | bridge Host fence (#84): loopback allowed, a remote peer behind a loopback Host refused, `--trusted-host` (port-less matches any port, explicit port matches exactly), `--public-url`, the bind address, cross-site and foreign-Origin refused, connection-auth delegation, fail-closed behavior, and settings-client subpath resolution via `document.baseURI` | `node tools/assert-bridge-access.mjs` (14) |
| `assert-provider-takeover.mjs` | provider takeover: both the legacy property API and the rc.2 `config.*` refs, a single batched `settings.mutate(web)`, explicit foreign providers left untouched, an explicit `http` kept when `fetchProviderTakeover` is off, `fetchProviderForce` taking `deepseek-fetch-api` back without touching search, saving the plugin settings re-taking fetch right away (and leaving web alone when off), describe()-triggered events ignored when nothing changed, nested config changes and web rebuilds reported separately, re-takeover after DSH's search switch is turned off (both `deepseek-search-api` and `deepseek-official` count as the factory default), apply re-entry / duplicate registrations tolerated, and repeated logs deduplicated | `node tools/assert-provider-takeover.mjs` (25) |

Any failure exits non-zero with the failing items listed. Passing the path of an older file shows the pre-fix failures (proving the assertions are not vacuous). Worth running before a release.

> The settings card mounts into the official `plugins.row.config` component-row slot on the sidebar Plugins page (built into DSH), and configuration reads/writes go through the plugin's own bridge. **No `dsh-web-ui` dependency — the plugin can be used standalone.**

### Proxy Note (for Users in Mainland China)

This plugin has two independent outbound paths, and both need the proxy configured:

1. **Search** (`web_search` / `multi_search` / `advanced_search` / `platform_search` / `video_search`, …) goes through `globalThis.fetch` (undici), so whether it is proxied depends on undici's global dispatcher.
2. **Body fetching** (`web_fetch`, plus the T1 direct fetch and T1.5 headless-browser tiers of `research`, and the exa / firecrawl / crawl4ai cloud calls) used plain `node:https` and child processes. That layer **never read the proxy environment variables and never saw the undici dispatcher**, which is why search works while fetching keeps timing out — a proxy plugin installed for undici cannot reach it. It now reads the proxy environment itself and opens an HTTP `CONNECT` tunnel per hop (the browser tier gets `--proxy-server` instead).

Configure (`http_proxy` / `https_proxy` / `all_proxy` / `no_proxy`, either case, lowercase wins, empty means unset):

```sh
export HTTPS_PROXY=http://127.0.0.1:7897   # Your proxy address
export HTTP_PROXY=http://127.0.0.1:7897
export NO_PROXY=localhost,127.0.0.1,::1    # Optional
```

- Only `http://` / `https://` proxies are supported (Basic auth allowed); `socks5://` is ignored and the request goes direct.
- Loopback addresses (`localhost`, `127.0.0.1`, `::1`, `127.0.0.0/8`) always go direct.
- `NO_PROXY` accepts comma-separated domains, `host:port`, and `*`.
- When proxied, the proxy resolves the hostname so the `lookup` hook no longer applies; every redirect hop is therefore re-checked by the SSRF guard explicitly, and settings such as `allowFakeIpCidrs` keep working.
- If the proxy is unreachable the usual degradation to the cloud tiers still happens, and the error message names the reason (`proxy <host> refused CONNECT ...`).
- This does not depend on Node 24's `NODE_USE_ENV_PROXY`; Node ≥ 20 is enough. That variable only affects the undici path.

Windows users: The desktop shortcut already includes `NODE_USE_ENV_PROXY=1` + `HTTPS_PROXY` (`set NODE_USE_ENV_PROXY=1&& set HTTPS_PROXY=...`).

### How It Works

- `lib/index.js`: Host side. Implements `WebSearchProvider` (`id` / `available()` / `search()`), unified engine routing + auto-fallback (paid engines first, free as fallback); parses `timeRange` (fixed tiers / relative values / absolute dates) and forwards it to each engine; declares its editable config as volatile fields on the `web-search-free` composition entry and ships its own settings page (`plugins.row.config`); provides the `/api/dsh-free-search-settings` read/write bridge + `raw-search` debug endpoint; registers the `free_search_test`, `platform_search`, `video_search`, and `advanced_search` tools; dynamically injects the engine list into system prompts (auto-refreshes on settings change).
- `lib/client.js`: Browser side. React configuration card (engine select, key inputs, connectivity test, and Chinese/English toggle), mounted into the official `plugins.row.config` component-row slot on the sidebar Plugins page; registers the `/free-search-engine` popup switch command (`commandUi` popupSelect, the same mechanism as `/model`).
- `cordis.patch.yml`: Plugin loader configuration.

### License

MIT

---

**[chirag@oriz.in](mailto:chirag@oriz.in)**

<footer class="hire-me">
    <h3>Hire me</h3>
    <p>Chirag Singhal — building free, open APIs and tools.</p>
    <p>
        <a href="mailto:chirag@oriz.in">chirag@oriz.in</a> ·
        <a href="https://github.com/chirag127">GitHub</a> ·
        <a href="https://www.linkedin.com/in/chirag127/">LinkedIn</a> ·
        <a href="https://x.com/singhal127">X</a> ·
        <a href="https://www.youtube.com/@ChiragSinghal127">YouTube</a> ·
        <a href="https://www.instagram.com/chiragsinghal127/">Instagram</a> ·
        <a href="https://www.reddit.com/user/Far_Macaron_9910/">Reddit</a> ·
        <a href="https://buymeacoffee.com/chirag127">Buy me a coffee</a>
    </p>
</footer>
