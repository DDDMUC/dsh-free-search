# dsh-free-search

**Free search plugin for DeepSeek Harness — no API key, zero cost, multiple switchable engines.**

[![npm](https://img.shields.io/npm/v/dsh-free-search?style=flat)](https://www.npmjs.com/package/dsh-free-search)
[![license](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[简体中文](./README.md) · **English**

## Contents

- [Introduction](#introduction)
- [Features](#features)
- [Supported Engines](#supported-engines)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [Advanced](#advanced)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

## Introduction

dsh's default search provider relies on the official DeepSeek API key (`DEEPSEEK_API_KEY`). If you do not have (or prefer not to use) an official key, or you run a gateway like opencode-go whose OpenAI-compatible endpoint does not support the `web_search` tool, the built-in search inevitably fails and the agent will tell you it cannot access the internet.

This plugin registers a multi-engine search provider into DeepSeek Harness (the `ctx.web` seam): multiple free engines with automatic fallback, so you never depend on the official key. `web_search` picks it up automatically; a web settings page switches engines, configures API keys and tests all engines in one click; `/free-search-engine` switches from the chat with a popup picker.

<p align="center">
  <a href="assets/settings-free1.png">
    <img src="assets/settings-free1.png" alt="Free engine settings (Bing as an example)" width="820" />
  </a>
  <br>
  <sub>▲ Free engine settings (Bing as an example)</sub>
</p>

## Features

- **Zero cost** — multiple free engines, no key, no registration.
- **Multi-engine**: DuckDuckGo (HTML/Lite), Bing, SearXNG (meta-search with custom instances), AnySearch, Exa, Tavily, Keenable, Firecrawl, Parallel, Perplexity, SerpBase, Serply, DeepSeek Official, You.com, Baidu Qianfan, Kimi, Aliyun Bailian, Volcano Doubao, Zhihu web-wide/site search (`zhihu_global`/`zhihu_site` via the Zhihu open-platform MCP), and model-based OpenAI / Gemini / Claude search.
- **Web settings page** — engine switching, API key configuration (keys masked as "configured"), Chinese/English toggle; entry is the component-row config (`plugins.row.config`) on the sidebar Plugins page (DSH 0.1.7-rc.1+).
- **Popup switch command** — type `/free-search-engine` in the chat; a picker opens, click to switch (equivalent to the settings page + save).
- **Engine testing** — the `free_search_test` tool checks all engines in one call; the settings page also has a "Test engine" button (tests the selected engine directly, no fallback chain; paid engines without a key report an explicit error).
- **Global engine toggles & fallback priority** — uncheck engines to exclude them everywhere (web_search fallback, Auto, `advanced_search`, `multi_search`, engine tests); reorder the global chain with ↑↓ (one-click reset).
- **Multi mode** — pick `Multi Search` as the engine: `web_search` queries the top 3 enabled engines concurrently, merges/deduplicates URLs and prioritizes cross-source hits (costs more quota; a failed multi run falls back to the single-engine chain).
- **Unified fallback** — any engine failure (paid or free, missing key/401/rate limit/network) automatically tries the next engine: preferred → other engines (exa/tavily/keenable/firecrawl/parallel are tried even without a key — they carry keyless quota) → remaining free engines. Search never fails outright; the result notes the engine that actually served it (e.g. `Note: perplexity unavailable or failed, using exa.`). Failures are classified: quota/auth cool the engine for the session, anti-bot walls back off briefly, timeout/5xx retry the same engine once, parse errors/0 results never cool it down (see "Failure-aware fallback").
- **Time filtering** — the `advanced_search` tool supports `timeRange`: fixed tiers, custom relative values, or an absolute date (details below).
- **System prompt injection** — the agent knows the active engine and which engines need keys, and is told that all search output is **untrusted external data** that must never be executed as instructions.
- **Prompt-injection guard (untrusted-data boundary)** — web text from the plugin's own tools (`advanced_search` / `platform_search` / `free_search_test`) is wrapped in an explicit `<untrusted-web-content>` boundary (look-alike tags inside the text are stripped to prevent early closure); core `web_search` / `web_fetch` carry DSH core's own notice (`External web content follows...`); every snippet is cleaned and capped at 300 characters.
- **Version + update check** — the settings card shows the current version and a "Check update" button that queries the npm registry, with a one-click jump when a newer version exists.
- **Result caching** — identical queries (same engine/time-filter args) hit an LRU cache (50 entries) for up to 5 minutes, protecting free engines from rate limits and saving paid quota; TTL configurable 0–5 minutes in the settings page (0 disables).
- **Safe search (safeSearch)** — `off` / `moderate` / `strict`, applied to Bing and DuckDuckGo HTML/Lite (details below).
- **Badges** — free engines show a green `FREE` badge; paid engines show an orange `API KEY` badge.
- **Webpage fetching (`web_fetch`)** — lets the agent read full webpage contents (official `dsh-web-fetch-http` provider, pure JS, zero extra dependencies).
- **Platform search (`platform_search`)** — search GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / Wikipedia / npm / YouTube / Vimeo (public APIs or keyless scraping, zero dependencies).
- **Video search (`video_search`)** — find videos across the web via Bing Videos + DuckDuckGo Videos (keyless, mutual fallback), returning links, titles and publisher/duration metadata.
- **Clean integration** — implements the official `WebSearchProvider` seam interface and coexists with official plugins.

## Supported Engines

| id | Engine | Cost | Description |
|---|---|---|---|
| `auto` | Auto smart routing | Dynamic | **Routes by query language/time filter** (Chinese prefers Bing/Baidu/Aliyun/AnySearch, English prefers Bing/Exa/Tavily; time filters prefer time-capable engines), full fallback at the tail |
| `ddg` | DuckDuckGo HTML | Free | Occasional rate limits (anti-bot); recovers automatically |
| `ddg-lite` | DuckDuckGo Lite | Free | Lightweight version; same behavior |
| `bing` | Bing | Free | **Default engine**, most stable, optimized for Chinese (`zh-CN`) |
| `anysearch` | AnySearch AI | Free | AI search, no key (anonymous quota) |
| `searxng` | SearXNG meta search | Free | Multi-instance failover; custom instances supported |
| `exa` | Exa | Free | **Usable without a key** (anonymous MCP); a key raises quota |
| `tavily` | Tavily | Free | **Usable without a key** (keyless anonymous); a key raises quota |
| `keenable` | Keenable | Free | **Usable without a key** (anonymous MCP); a key raises quota |
| `firecrawl` | Firecrawl | Free | **Usable without a key** (official keyless anonymous quota); a key raises limits |
| `parallel` | Parallel | Free | **Usable without a key** (official MCP anonymous quota); a key raises limits and enables precise time filtering |
| `perplexity` | Perplexity | Paid | Requires `PERPLEXITY_API_KEY` |
| `serpbase` | SerpBase | Paid | Requires `SERPBASE_API_KEY` (serpbase.dev, 100 free queries on signup) |
| `serply` | Serply | Paid | Requires `SERPLY_API_KEY` (serply.io, 2,500 free credits for the first 30 days); Google web results localized to the settings language |
| `deepseek-official` | DeepSeek Official | Paid | Requires `DEEPSEEK_API_KEY` |
| `you` | You.com | Paid | Requires `YOUCOM_API_KEY` ([you.com/platform/api-keys](https://you.com/platform/api-keys), free tier on signup) |
| `baidu` | Baidu Qianfan AI Search | Quota | Requires `BAIDU_API_KEY` (50 free calls/day, then pay-as-you-go); Chinese web-wide, supports time filtering |
| `kimi` | Kimi (Moonshot) web search | Paid | Requires `MOONSHOT_API_KEY` (basic ~¥0.01/call); Chinese results with body chunks |
| `aliyun` | Aliyun Bailian EnhancedSearch | Paid | Requires `DASHSCOPE_API_KEY` (MCP search_pro, ~¥0.03/call, 200 free calls for new users); Chinese web-wide with source hostnames |
| `doubao` | Volcano web search (Doubao) | Free quota | Requires `DOUBAO_SEARCH_API_KEY` (**500 free queries/month**, pay-as-you-go beyond); strong for fresh Chinese content, supports time/site filters, returns long summaries |
| `zhihu_global` | Zhihu web-wide search (open-platform MCP) | Paid | Requires `ZHIHU_API_KEY`; supports the time filter (`publish_time`); skipped automatically without a key |
| `zhihu_site` | Zhihu site search (open-platform MCP) | Paid | Requires `ZHIHU_API_KEY`; the site-search endpoint has no time-filter parameter (time filtering not supported) |
| `openai` | OpenAI built-in web search | Paid | Requires `OPENAI_API_KEY`; uses the Responses API `web_search` tool and returns a cited answer. **Billed per search, explicit selection only** (never picked by fallback/auto); default `gpt-6-luna`, model/endpoint configurable (`openaiModel` / `openaiBaseUrl`) |
| `gemini` | Gemini grounding with Google Search | Paid | Requires `GEMINI_API_KEY` (falls back to `GOOGLE_API_KEY`); uses the recommended **Interactions API** (`POST /v1beta/interactions`, `tools:[{type:"google_search"}]`) and reads citations from `steps[].content[].annotations`. **Billed per search, explicit selection only**; default `gemini-3.8-flash`, model/endpoint configurable (`geminiModel` / `geminiBaseUrl`) |
| `claude` | Claude server-side web_search | Paid | Requires `ANTHROPIC_API_KEY`; results come from `web_search_tool_result`. **Billed per search, explicit selection only**; default `claude-sonnet-5-5`, model/endpoint configurable (`claudeModel` / `claudeBaseUrl`) |

- **The default engine is `bing`** (free and most stable) — ready out of the box.
- **Auto-failover**: any engine failure (rate-limited free engine, missing/invalid paid key, network error) automatically tries the next engine — the configured engine first, then other engines, then the remaining free engines, with a note naming the engine that actually served the results. Search never fails outright because of engine issues.
- **Official links in settings**: free engines show "Visit Website →", paid engines show "Get API Key →" (new tab):
  - [Exa API keys](https://dashboard.exa.ai/api-keys)
  - [Tavily console](https://app.tavily.com/home)
  - [Keenable login](https://keenable.ai/login)
  - [Parallel platform](https://platform.parallel.ai)
  - [Perplexity API settings](https://www.perplexity.ai/settings/api)
  - [SerpBase](https://serpbase.dev)
  - [Serply](https://serply.io) ([API docs](https://serply.io/docs))
  - [DeepSeek API keys](https://platform.deepseek.com/api_keys)
  - [Doubao / Volcano web search console](https://console.volcengine.com/search-infinity/web-search)
  - [You.com API keys](https://you.com/platform/api-keys)

### Why are some engines free?

- **AnySearch**: its `v1/search` REST endpoint provides anonymous public search quota without registration or a key. Rate-limited (fine for daily queries), but reliable as one of the mutual-fallback free engines.
- **Exa**: the public MCP endpoint (`mcp.exa.ai/mcp`) supports anonymous calls, so it works without a key; `EXA_API_KEY` grants a higher quota.
- **Tavily**: keyless anonymous quota via the `x-tavily-access-mode: keyless` header; `TAVILY_API_KEY` switches to the account tier for higher quota and more stable results.
- **Keenable**: without a key it is called via its public MCP endpoint (`api.keenable.ai/mcp`); `KEENABLE_API_KEY` switches to the REST API (`api.keenable.ai/v1/search`) for higher quota and organization-scoped limits.
- **Firecrawl**: its `/v2/search` endpoint works **without a key** (officially documented, with anonymous rate limits); `FIRECRAWL_API_KEY` raises the limits. Supports `tbs` time filtering (`qdr:h/d/w/m/y` and custom date ranges).

## Quick Start

### Requirements

- git
- Node ≥ 20 (see `engines` in `package.json`)
- DeepSeek Harness ≥ 0.1.7-rc.1 (for the settings page and the popup command; plain CLI use is not affected)

### Installation

```sh
git clone https://github.com/DDDMUC/dsh-free-search.git
dsh plugin --profile web add /path/to/dsh-free-search    # register the clone as a web-profile plugin
dsh web    # restart the host to load the plugin
```

After installing and restarting, `web_search` goes through this plugin automatically (default engine `bing`, keyless): ask the agent to "search for today's AI news" to verify. See [Usage](#usage) for the settings entry and tools.

## Usage

### Web Settings (Recommended)

After installation, open the config page (DSH 0.1.7-rc.1+):

- Sidebar **Plugins** page → **Installed** group → `free-search` → click the `web-search-free` component row (the row's "configure" entry)

The config page provides:

- **Search engine**: pick from the dropdown; changes take effect on save.
- **API keys**: enter keys for Exa / Tavily / Keenable / Firecrawl / Parallel / Perplexity / DeepSeek / SerpBase / Serply / You.com (password fields, displayed as "configured" once saved; Exa / Tavily / Keenable / Firecrawl / Parallel also work without a key).
  - **Recommended**: store paid-engine keys in the harness credential center `~/.dsh/.credentials.yaml` (e.g. `DEEPSEEK_API_KEY: sk-...`, same as the official LLM providers — one place for all keys). Resolution order: credentials center > settings page > environment variable; the settings fields remain for backward compatibility.
- **Test engine**: tests the selected engine directly (no fallback chain; paid engines without a key report an explicit error).
- **Use Bing default**: switch back to the stable free Bing engine; `Discard` only cancels unsaved edits.
- **Platform search**: check platforms (GitHub / V2EX / Bilibili / YouTube / Vimeo) to enable them for the `platform_search` tool.
- **EN / 中文**: toggle the interface language (default Chinese).

<table align="center" style="border: none; border-collapse: collapse;">
  <tr style="border: none;">
    <td align="center" width="50%" style="border: none; padding: 6px;">
      <a href="assets/settings-free.png">
        <img src="assets/settings-free.png" alt="Free engine settings" width="100%" />
      </a>
      <br>
      <sub>▲ <b>Free engine</b> (green FREE badge and website link)</sub>
    </td>
    <td align="center" width="50%" style="border: none; padding: 6px;">
      <a href="assets/settings-apikey.png">
        <img src="assets/settings-apikey.png" alt="Paid engine settings" width="100%" />
      </a>
      <br>
      <sub>▲ <b>Paid / API key engine</b> (orange API KEY badge and link)</sub>
    </td>
  </tr>
</table>

### Switching engines from the chat (/free-search-engine)

No need to open the settings page: type `/free-search-engine` and a **picker opens with all engines** (the same interaction as `/model`). Click to switch; the current engine is marked. Equivalent to switching + saving in the settings page; the language follows the settings page.

The command only changes the preferred engine; search still goes through `web_search` + the unified fallback chain — even if the preferred engine fails, it automatically switches to another. The system prompt refreshes accordingly.

### Engine toggles, fallback priority and Multi mode

The settings page has three blocks (all saved into the entry config):

- **Globally enabled engines**: unchecking an engine excludes it everywhere — the web_search fallback chain, Auto routing, `advanced_search`, `multi_search` and engine tests. At least one engine must remain enabled.
- **Global fallback priority**: reorder with ↑↓. The preferred engine is still tried first; Auto keeps its language/time routing while a customized order governs the rest. Disabled engines stay listed (marked "disabled") but are skipped; "Reset default order" restores the defaults.
- **`Multi Search` in the engine dropdown**: `web_search` then queries the top 3 enabled routed/prioritized engines concurrently, merges/deduplicates URLs and prioritizes cross-source hits. This multiplies quota usage; a failed multi run falls back to the single-engine chain and says so in the result note.

### Safe search (safeSearch)

- Config field `safeSearch`: `off` (engine default, no parameter) / `moderate` / `strict`.
- Applies to Bing (adlt), DuckDuckGo HTML (adlt) and DuckDuckGo Lite (adlt).
- Default `off`: no extra filtering, keeping each engine's own default; switch under Settings → Plugins → Free Search when needed.

### Failure-aware fallback

The fallback chain classifies failures before reacting (issue #36):

- **`quota`** (HTTP 402 / `NO_MORE_CREDITS` / SerpBase free quota exhausted): fail over immediately and put the engine on a **process-wide cooldown** so later searches stop hammering it.
- **`auth`** (401/403, invalid or missing key): same — cooled for the rest of the session (reload the plugin after fixing the key).
- **`bot-wall`** (e.g. the DDG anti-bot challenge): cools down briefly (60s by default), then rejoins the chain.
- **`transient`** (timeout / 5xx / network / 429): the engine is **retried once** before advancing, so a single blip does not drop a good engine.
- **`invalid-response`** (parse failure / schema change / 0 results): still fails over, but is reported as a plugin-side issue and does not cool the engine down.

The `Note:` line names the class, e.g. `Note: exa is out of quota, using doubao.`, `Note: perplexity is misconfigured (API key rejected), using doubao.`, `Note: bing failed (transient), using doubao.`. `free_search_test` also reports the class per failed engine (`failureClass`).

Cooldowns are per-process (reloading or restarting clears them) and apply to the configured preferred engine too: if it is cooling down, this run skips it, fails over and says `is cooling down`. An engine that succeeds is automatically un-cooled.

`fallbackOn` decides which failure classes are **allowed** to trigger a fallback: by default all six are checked ("search never fails outright"). Unchecking a class makes such a failure **stop the search and surface that engine's error** instead of trying another engine. An empty array `[]` aborts on any failure. Note that **missing keys, disabled engines and unsupported time filters are not failures** and always advance. There is a matching checkbox group in the settings page, or write `fallbackOn: [quota, auth, bot-wall, transient, invalid-response, unknown]` in the config.

### Asking the agent to test all engines

Tell the agent "test all search engines" and it will call `free_search_test` and report:

```text
Search engine test:
- ddg: FAIL - DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary) - Bing works
- bing: OK (2 results, e.g. "DeepSeek Harness developer preview...")
- exa: FAIL - EXA_API_KEY not configured
```

### Time filtering (`advanced_search`)

Ask for "news from the last week", "releases this month", "updates from the last 3 days" or "posts since July" and the agent calls `advanced_search` with a `timeRange` parameter. It uses the same unified fallback chain, can force a specific `engine`, and returns the same shape as `web_search`.

**`timeRange` accepts three forms:**

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

**Nearest-tier mapping rule**: `≤2 days → day`, `≤14 days → week`, `≤90 days → month`, otherwise `year`. For example, `3d` becomes `day` on Tavily and `2mo` becomes `month`.

**Engine-chain priority**: when a `timeRange` is present, engines that support time filtering (tavily / exa / keenable / firecrawl / parallel / searxng / ddg / ddg-lite) move to the front of the chain so the filter actually takes effect — even if the preferred engine is bing (which does not support filtering).

Example: *"Find DSH news from the last 3 days"* → the agent calls `advanced_search` with `timeRange: "3d"`.

### Multi-engine concurrent search (`multi_search`)

When a question needs **cross-source verification** to avoid single-engine bias or a single-source deadlock, the agent can call `multi_search`:

- **Concurrent execution**: defaults to querying the top 3 recommended engines for the query type (or an explicit `engines` list). Each engine independently resolves API keys and handles errors (missing keys are skipped without failing the batch).
- **Deduplication & merge**: URLs are normalized and merged; items found by more engines rank first, with a `seenIn` source list attached (e.g. `[seen in: bing, exa]`).
- **Untrusted boundary**: the `<untrusted-web-content>` wrapper is enforced and snippets are cleaned.
- ⚠️ Note: parallel engines consume more quota; use on demand.

### Fetching webpage content (`web_fetch`)

After searching, the agent can **read full webpage content** (e.g. "open the first link and summarize it"). The `web_fetch` tool is enabled by default (official `dsh-web-fetch-http` provider):

- Follows redirects and decodes HTML to plain text.
- Supports timeout and response size limits.
- ⚠️ Note: `web_fetch` has no SSRF protection; the agent could theoretically reach internal network addresses — use accordingly.

### Platform search (`platform_search`)

Ask the agent to search a specific platform (e.g. "search GitHub for deepseek harness", "find related videos on Bilibili", "V2EX discussions about dsh"). The `platform_search` tool supports:

| Platform | Purpose |
|---|---|
| `github` | GitHub repository search (public API, free, no key) |
| `v2ex` | V2EX hot / relevant topics |
| `bilibili` | Bilibili video / content search (public API) |
| `reddit` | Reddit posts / discussions (public JSON API; may be blocked by anti-bot in some networks) |
| `hn` | Hacker News discussions (official Algolia API) |
| `stackoverflow` | Stack Overflow Q&A (official public Stack Exchange API) |
| `wikipedia` | Wikipedia articles (zh.wikipedia.org for Chinese; en.wikipedia.org when `lang: en`) |
| `npm` | npm package search (registry API) |
| `youtube` | YouTube video search (scrapes `ytInitialData`, keyless) |
| `vimeo` | Vimeo video search (scrapes embedded data; falls back to `site:vimeo.com`, keyless) |

Public APIs or keyless scraping, zero external dependencies, no keys. `youtube` / `vimeo` must be enabled under Settings → Platform search first.

### Video search (`video_search`)

Ask the agent to find videos: "find some videos about X", "any tutorials for Y". `video_search` searches across the web:

| Source | Notes |
|---|---|
| `bing` | Bing Videos (scrapes `vrhm` metadata, keyless) |
| `ddg` | DuckDuckGo Videos (vqd + `v.js`, keyless) |

Both sources are tried by default with mutual fallback, returning `url / title / snippet` (publisher, duration, etc.). **Keyless scraping — may break if the site changes its markup**; to search a specific site (YouTube / Vimeo / Bilibili) use `platform_search`.

## Configuration

### Config file (cordis.patch.yml)

Since DSH 0.1.7-rc.1 the configuration lives with the profile's plugin entry: the settings page and `/free-search-engine` both write the `config` of the `web-search-free` (`dsh-free-search`) entry in the active profile's `cordis.patch.yml`.

```yaml
# config of that entry in profiles/<profile>/cordis.patch.yml:
provider: bing              # ddg / ddg-lite / bing / searxng / anysearch / exa / tavily / keenable / firecrawl / parallel / perplexity / serpbase / serply / deepseek-official / you / baidu / kimi / aliyun / doubao / openai / gemini / claude / auto / multi
fallbackOn: [quota, auth, bot-wall, transient, invalid-response, unknown]   # failure classes allowed to trigger fallback; [] = abort on any failure (default: all)
lang: zh                    # settings UI language (zh / en)
bingMarket: zh-CN           # Bing market
region: cn-zh               # DuckDuckGo region (optional)
safeSearch: off             # safe search: off / moderate / strict
searxngInstances:           # custom SearXNG instances (optional)
  - https://your-instance.example
exaApiKey: ...              # or configure via the settings page
tavilyApiKey: ...           # or configure via the settings page
keenableApiKey: ...         # or configure via the settings page
firecrawlApiKey: ...        # or configure via the settings page
parallelApiKey: ...         # or configure via the settings page
perplexityApiKey: ...
serpbaseApiKey: ...         # or configure via the settings page
serplyApiKey: ...           # or configure via the settings page
deepseekApiKey: ...
```

### Legacy settings.yaml migration

The old `free-search:` section of `~/.dsh/settings.yaml` is **not** imported by the DSH core (`importLegacyDocument` only maps `ui-developer-tools` / `ui-onboarding` / `shell`); the file is renamed to `settings.yaml.imported` after the other sections are imported and the values stay there.

The plugin detects that section in `settings.yaml.imported` (or a still-present `settings.yaml`) at startup and seeds the recognized fields into the entry `config` **once** (watch for `free-search: migrated N field(s)…` in the startup log). You can also migrate manually by copying the values into the plugin row config.

### Proxy note (mainland China)

Engines like DuckDuckGo may need a proxy, and Node.js `fetch` does not use the system proxy by default. Set the following for the dsh process (Node 24+):

**Linux / macOS**

```sh
export NODE_USE_ENV_PROXY=1
export HTTPS_PROXY=http://127.0.0.1:7897   # your proxy address
export HTTP_PROXY=http://127.0.0.1:7897
```

**Windows PowerShell**

```powershell
$env:NODE_USE_ENV_PROXY = "1"
$env:HTTPS_PROXY = "http://127.0.0.1:7897"   # your proxy address
$env:HTTP_PROXY = "http://127.0.0.1:7897"
dsh web
```

Windows users can also double-click `tools/启动DeepSeekHarness.cmd` (sets the proxy variables above and starts `dsh web`).

## Advanced

### Takeover behavior and verification

The plugin **takes over search at runtime** once loaded (it does not touch the config layer):

- When `web.searchProvider` is unset, or still the shipped default `deepseek-official`, it switches to this plugin's provider (fixed id `ddg`).
- If you (or another plugin) explicitly selected a different provider, it does not steal it — it only logs a WARN with a copy-pasteable YAML snippet.

**It no longer writes `searchProvider: ddg` into the config layer.** A static override used to create a dangling reference: a patch replaces the whole row config, so when the plugin's row was **disabled or skipped** (e.g. switched off in the plugin manager) the config still said `ddg` while nothing registered it, and every search failed with:

```text
Error: configured web provider "ddg" is not registered
```

Without that override, a disabled plugin leaves `web.searchProvider` at the shipped default (`deepseek-official`) so search still works through the official provider; when the plugin is enabled the runtime takeover above points it at `ddg`.

> [!WARNING]
> If you previously added the snippet below by hand to `profiles/<profile>/cordis.patch.yml` *and* the plugin is not enabled, you will see that error — **just remove the snippet** (or re-enable the plugin):

```yaml
# Optional; normally unnecessary — only to force a specific provider.
# Since DSH 0.1.2 a patch REPLACES the whole entry config: keep fetchProvider.
- id: web
  config:
    searchProvider: ddg
    fetchProvider: http
```

- `searchProvider: ddg` — this plugin's **fixed provider id**, not "use the DuckDuckGo engine"; the engine is chosen by the `provider` field in settings (`bing` / `baidu` / `auto` / …).
- `fetchProvider: http` — the official web-fetch provider; keep it when declaring the row by hand.
- To go back to official search: disable this plugin's entry in the plugin manager — no config edit needed.

### Sister plugin: dsh-preset-workbench

A **sister plugin** by the same author: a **visual workbench for creating/editing agent presets** right inside Settings — sectioned prompts, 15 capability toggles, built-in "Whale Girl / Liangshen Mode" templates, no YAML needed. Pair them up: **free-search gives your AI web search, preset-workbench shapes its persona & capabilities** — both free and zero-config.

- Repo: [DDDMUC/dsh-preset-workbench](https://github.com/DDDMUC/dsh-preset-workbench)
- Install: `dsh plugin --profile web add github:DDDMUC/dsh-preset-workbench`
- Usage: Settings → Preset Workbench

If preset-workbench is useful to you too, a ⭐ on its repo is always welcome.

### Dependency note

This plugin intentionally specifies `@deepseek-ai/dsh-settings` and `@deepseek-ai/dsh-tools` as `peerDependencies`: the DSH runtime must use a single instance from the installation tree. Always install with `dsh plugin --profile <profile> add ...`; do **not** copy DSH core packages into a profile-local `node_modules` — duplicate copies can break the tool scheduler.

### Local tools (tools/)

The `tools/` directory ships small local utilities (zero dependencies):

- **`启动搜索引擎切换器.cmd`** (Windows) — double-click to start a local Node server (`http://127.0.0.1:4789`) and open the engine picker page.
- **`启动DeepSeekHarness.cmd`** (Windows) — a DSH launcher with proxy env vars preset (`NODE_USE_ENV_PROXY=1` and `127.0.0.1:7897`), then `dsh web` (only opens the browser if already running).
- **`switch-engine.html`** — the picker page: shows the current engine and writes the new one.
- **`server.mjs`** — the local service reading/writing `~/.dsh/profiles/web/cordis.patch.yml`.
- **`switch-engine.ps1`** — headless CLI: `powershell -File tools/switch-engine.ps1 -Engine bing`.

Restart `dsh web` after switching.

> [!NOTE]
> The settings card mounts into the official `plugins.row.config` component-row slot on the sidebar Plugins page (built into DSH), and reads/writes config through the plugin's own bridge. **No `dsh-web-ui` dependency — the plugin works standalone.**

## Architecture

<p align="center">
  <a href="docs/assets/architecture.png">
    <img src="docs/assets/architecture.png" alt="dsh-free-search system architecture" width="860" />
  </a>
</p>

The main path of one `web_search`: agent → DSH host (`ctx.web`) → the plugin's provider (cache hit returns immediately) → engine routing builds the chain → engine endpoints; failures are classified, cooled down or retried, and the next engine takes over. Every component in the diagram carries a source-line reference; an [interactive HTML version](docs/assets/architecture.html) (with evidence links) ships with the repo.

<p align="center">
  <img src="docs/assets/live-demo.gif" alt="Engine pool and fallback chain in motion (simulated data)" width="720" />
</p>

A dynamic view of the engine pool and the fallback chain (**simulated, illustrative**: counters, log and triggers move together only to demonstrate the mechanism, not real traffic). [Open the live version in a browser](docs/assets/live-panel.html).

### How it works

- `lib/index.js`: host side. Implements `WebSearchProvider` (`id` / `available()` / `search()`), unified engine routing + auto-fallback (paid first, free as backstop); parses `timeRange` and forwards it to each engine; declares editable volatile config on the `web-search-free` entry and ships its own settings page (`plugins.row.config`); provides the `/api/dsh-free-search-settings` read/write bridge + `raw-search` debug endpoint; registers `free_search_test`, `platform_search`, `video_search`, `advanced_search`, `multi_search`; injects the engine list into the system prompt (auto-refresh on settings change).
- `lib/client.js`: browser side. React settings card (engine select, key inputs, connectivity test, language toggle) mounted into the `plugins.row.config` slot; registers the `/free-search-engine` popup command (`commandUi` popupSelect, same mechanism as `/model`).
- `cordis.patch.yml`: plugin loader configuration.

## Contributing

Issues and PRs are welcome; see [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev setup and the pre-submit checklist.

If this plugin helps you, a ⭐ on [GitHub](https://github.com/DDDMUC/dsh-free-search) would mean a lot — it's the biggest motivation for continued maintenance. Thank you!

## License

This project is licensed under the [MIT License](./LICENSE).
