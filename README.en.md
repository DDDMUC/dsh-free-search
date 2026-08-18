# dsh-free-search

**Free web search plugin for DeepSeek Harness — no API key required, zero cost, multi-engine switcher.** A plugin that adds multi-engine search providers to DeepSeek Harness (dsh), registered into the `ctx.web` seam. The built-in `web_search` tool picks it up automatically. Supports switching engines via the web settings UI, configuring API keys, and one-click testing of all search engines.

English | [中文](./README.md)

<div align="center">
  <a href="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-free1.png">
    <img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-free1.png" alt="Free Engine Settings (Bing)" width="820" />
  </a>
  <br>
  <sub>▲ Free engine (using Bing as an example)</sub>
</div>

## Why You Need It

dsh's default search provider relies on the official DeepSeek API key (`DEEPSEEK_API_KEY`). If you:
- Do not have (or prefer not to use) an official DeepSeek key,
- Use a gateway like opencode-go (whose OpenAI-compatible endpoint does not support the `web_search` tool),

...then the built-in search will inevitably fail, and the agent will tell you "I cannot access the internet."

This plugin provides multiple free search engines with automatic fallback, completely freeing you from relying on DeepSeek's official key.

## Features

- **Zero Cost** — Multiple free engines with no API key or registration required
- **Multi-Engine Support** — DuckDuckGo (HTML / Lite), Bing, AnySearch AI, SearXNG (meta-search with custom instances), Exa, Perplexity, and DeepSeek Official
- **Web Settings UI** — Engine switching and API key configuration (API keys are masked in the UI and displayed as "configured")
- **Engine Testing Tool** — `free_search_test`, allowing the agent to test the availability of all engines in a single call
- **Unified Engine Fallback** — Any engine failure (paid or free, missing key, 401, rate limit, network error) automatically tries the next engine: other paid engines with configured keys first, then free engines. Search never fails outright.
- **System Prompt Injection** — The agent is aware of the currently active engine and which engines require API keys
- **Visual Badges** — Free engines feature a green `FREE` badge, while paid engines show an orange `API KEY` badge in the settings UI
- **Webpage Fetching (`web_fetch`)** — Allows the agent to read full webpage contents (official `dsh-web-fetch-http` provider, pure JS, zero extra dependencies)
- **Platform Search (`platform_search`)** — Search GitHub / V2EX / Bilibili (public APIs, zero extra dependencies)
- **Clean Integration** — Implements the official `WebSearchProvider` seam interface, coexisting seamlessly with official plugins

## Supported Engines

| id | Engine | Cost | Description |
|---|---|---|---|
| `ddg` | DuckDuckGo HTML | Free | Occasional rate limits (anti-bot challenges); recovers automatically |
| `ddg-lite` | DuckDuckGo Lite | Free | Lightweight version; same rate-limit behavior as above |
| `bing` | Bing | Free | **Default engine**, most stable, optimized for Chinese (`zh-CN`) |
| `anysearch` | AnySearch AI | Free | AI search, no key needed (anonymous quota) |
| `searxng` | SearXNG Meta Search | Free | Multi-instance automatic failover; supports custom instances |
| `exa` | Exa | Free | **Usable without a key** (anonymous MCP); configure a key for higher quota |
| `perplexity` | Perplexity | Paid | Requires `PERPLEXITY_API_KEY` |
| `deepseek-official` | DeepSeek Official | Paid | Requires `DEEPSEEK_API_KEY` |

- **Default engine is `bing`** (free and most stable), ready to use out of the box after installation.
- **Auto-failover**: any engine failure (rate-limited free engine, or missing/invalid paid key, network error) automatically tries the next engine — other paid engines with configured keys first, then free engines (Bing/AnySearch etc.) — with a note attached to the results. Search never fails outright because of engine issues.
- **Official Links in Settings**: Free engines display "Visit Website →", while paid engines display "Get API Key →" (opens in a new tab):
  - Exa: <https://dashboard.exa.ai/api-keys>
  - Perplexity: <https://www.perplexity.ai/settings/api>
  - DeepSeek: <https://platform.deepseek.com/api_keys>

### Why is AnySearch free?

AnySearch (anysearch.com) is an AI search gateway that provides **anonymous public search quota** — it can be called directly via its `v1/search` REST endpoint without registration or an API key. Quotas are rate-limited (suitable for daily queries), but as one of the free engines with mutual fallback, it offers a reliable experience.

The same applies to Exa: its public MCP endpoint (`mcp.exa.ai/mcp`) supports anonymous requests, allowing it to work without an API key. Configuring `EXA_API_KEY` grants a higher usage quota.

## Installation

```sh
git clone https://github.com/DDDMUC/dsh-free-search.git
dsh plugin --profile web add /path/to/dsh-free-search
```

Then restart:

```sh
dsh web
```

### Dependency Note

This plugin intentionally specifies `@deepseek-ai/dsh-settings` and `@deepseek-ai/dsh-tools` as `peerDependencies`: the DSH runtime must use a single instance from the installation tree. Always install the plugin using `dsh plugin --profile <profile> add ...`. Do **not** copy DSH core packages into a profile-local `node_modules`, as duplicate copies can break the tool scheduler.

## Usage

### Web Settings (Recommended)

After installation, navigate to **Settings → Plugins → Configurable** tab → **Free Search** card (the official settings page):

- **Search engine**: Select an engine from the dropdown; changes take effect immediately upon saving.
- **API keys**: Enter keys for Exa / Perplexity / DeepSeek (password fields; displayed as "configured" once saved).
- **Use Bing default**: stage a switch back to the stable free Bing engine; `Discard` only cancels unsaved edits
- **Platform search**: check GitHub / V2EX / Bilibili to enable them for the `platform_search` tool (disabled platforms are skipped).

<table align="center" style="border: none; border-collapse: collapse;">
  <tr style="border: none;">
    <td align="center" width="50%" style="border: none; padding: 6px;">
      <a href="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-free.png">
        <img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-free.png" alt="Free Engine Settings" width="100%" />
      </a>
      <br>
      <sub>▲ <b>Free Engine</b> (shows green FREE badge and official website link)</sub>
    </td>
    <td align="center" width="50%" style="border: none; padding: 6px;">
      <a href="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-apikey.png">
        <img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-apikey.png" alt="Paid/API Key Engine Settings" width="100%" />
      </a>
      <br>
      <sub>▲ <b>Paid / API Key Engine</b> (shows orange API KEY badge and link to get an API key)</sub>
    </td>
  </tr>
</table>

### Configuration File / CLI

Configuration is stored in `~/.dsh/settings.yaml`:

```yaml
free-search:
  provider: bing              # ddg / ddg-lite / bing / searxng / exa / perplexity / deepseek-official
  bingMarket: zh-CN           # Bing market
  region: cn-zh               # DuckDuckGo region (optional)
  searxngInstances:           # Custom SearXNG instances (optional)
    - https://your-instance.example
  exaApiKey: ...              # Or configure via the web settings UI
  perplexityApiKey: ...
  deepseekApiKey: ...
```

### Asking the Agent to Test All Engines

Tell the agent *"Test all search engines"*, and it will call the `free_search_test` tool to check each engine sequentially and report back:

```
Search engine test:
- ddg: FAIL - DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary) - Bing works
- bing: OK (2 results, e.g. "DeepSeek Harness developer preview...")
- exa: FAIL - EXA_API_KEY not configured
```

### Fetch Webpage Content (`web_fetch`)

After searching, the agent can **read full webpage content** (e.g., *"Open the first link and summarize it"*). The `web_fetch` tool is enabled by default (official `dsh-web-fetch-http` provider):

- Automatically follows redirects and decodes HTML to plain text.
- Supports timeout and response size limits.
- ⚠️ Note: `web_fetch` does not have SSRF protection; the agent could theoretically access internal network addresses. Use as needed.

### Platform Search (`platform_search`)

Ask the agent to search specific platforms (e.g., *"Search GitHub for deepseek harness"*, *"Find related videos on Bilibili"*, or *"Discussions about dsh on V2EX"*). The `platform_search` tool supports:

| Platform | Purpose |
|---|---|
| `github` | GitHub repository search (public API, free, no key required) |
| `v2ex` | V2EX hot / relevant topics |
| `bilibili` | Bilibili video / content search (public API) |

All platform searches rely on public endpoints with zero external dependencies and work out of the box.

## Local Engine Switcher (`tools/`)

The `tools/` directory includes a lightweight, zero-dependency switcher:

- **`启动搜索引擎切换器.cmd`** (Windows) — Double-click to launch a local Node server (`http://127.0.0.1:4789`) and automatically open the engine selector page in your browser.
- **`switch-engine.html`** — The selector UI: displays current engine status and allows one-click switching.
- **`server.mjs`** — The local backend service responsible for reading/writing `~/.dsh/profiles/web/cordis.patch.yml`.
- **`switch-engine.ps1`** — Headless PowerShell script: `powershell -File tools/switch-engine.ps1 -Engine bing`.

Restart `dsh web` after switching to apply changes.

> The settings card mounts into the official `settings.plugin.item` slot (built into DSH), and configuration reads/writes go through the plugin's own bridge. **No `dsh-web-ui` dependency — the plugin can be used standalone.**

## Proxy Note (for Users in Mainland China)

Engines like DuckDuckGo may require a proxy. Since Node.js `fetch` does not use the system proxy by default, set the following environment variables for the dsh process (Node 24+):

```sh
export NODE_USE_ENV_PROXY=1
export HTTPS_PROXY=http://127.0.0.1:7897   # Your proxy address
export HTTP_PROXY=http://127.0.0.1:7897
```

Windows users: The desktop shortcut already includes this configuration (`set NODE_USE_ENV_PROXY=1&& set HTTPS_PROXY=...`).

## How It Works

- `lib/index.js`: Host side. Implements `WebSearchProvider` (`id` / `available()` / `search()`), unified engine routing + auto-fallback (paid engines first, free as fallback); registers the `free-search` settings namespace; provides the `/api/dsh-free-search-settings` read/write bridge + `raw-search` debug endpoint; registers the `free_search_test` and `platform_search` tools; dynamically injects the engine list into system prompts (auto-refreshes on settings change).
- `lib/client.js`: Browser side. React configuration card (engine select + key inputs), mounted into the official `settings.plugin.item` slot (Settings → Plugins → Configurable), without requiring `dsh-web-ui`.
- `cordis.patch.yml`: Plugin loader configuration.

## License

MIT
