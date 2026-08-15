# dsh-free-search

**Free web search provider for DeepSeek Harness — no API key required, multi-engine, zero cost.**

A plugin that adds multi-engine search providers to DeepSeek Harness (dsh), registered into the `ctx.web` seam. The built-in `web_search` tool picks it up automatically. Includes a web settings page for engine switching and API key configuration, plus an engine test tool.

[中文](./README.md) | English

## Why

dsh ships a DeepSeek-official search provider by default, which requires a valid `DEEPSEEK_API_KEY`. If you:
- don't have (or don't want) a DeepSeek official API key,
- already use a gateway like opencode-go (which does not expose a `web_search` tool),

...then the built-in search always fails and the agent tells you "I can't access the internet."

This plugin provides multiple free engines with automatic failover, fully independent of the DeepSeek official key.

## Features

- **Zero cost** — multiple free engines, no key, no registration
- **Multi-engine**: DuckDuckGo (html/lite), Bing, SearXNG (meta-search, custom instances), Exa, Perplexity, DeepSeek Official
- **Web settings UI** — engine switching + API key configuration (keys are redacted in the UI, shown as "configured")
- **Engine test tool** — `free_search_test`, lets the agent verify every engine in one call
- **Auto-failover** — free engines fall back to the next available one on failure/rate-limit
- **System prompt injection** — the agent knows the current engine and which need keys
- **FREE / API KEY badges** — green FREE badge for free engines, orange API KEY badge for paid ones
- **Clean integration** — implements the official `WebSearchProvider` seam, coexists with official plugins
- **web_fetch** — agent can fetch page content (official `dsh-web-fetch-http` provider, pure JS, zero extra deps)

## Engines

| id | Engine | Cost | Notes |
|---|---|---|---|
| `ddg` | DuckDuckGo HTML | Free | Occasionally rate-limited (anti-bot), recovers automatically |
| `ddg-lite` | DuckDuckGo Lite | Free | Lightweight variant, same caveat |
| `bing` | Bing | Free | **Default engine**, most stable, zh-CN optimized |
| `searxng` | SearXNG meta-search | Free | Multi-instance failover, custom instances supported |
| `exa` | Exa | Paid | Requires `EXA_API_KEY` |
| `perplexity` | Perplexity | Paid | Requires `PERPLEXITY_API_KEY` |
| `deepseek-official` | DeepSeek Official | Paid | Requires `DEEPSEEK_API_KEY` |

Free engines auto-fallback to another free engine on failure. Paid engines fail with a clear error when their key is missing or invalid — never a silent switch.

- **Default engine is `bing`** (free and most stable), works out of the box after install.
- **Settings page has official links**: free engines show "访问官网 →", paid engines show "获取 API Key →" (opens in a new tab):
  - Exa: <https://dashboard.exa.ai/api-keys>
  - Perplexity: <https://www.perplexity.ai/settings/api>
  - DeepSeek: <https://platform.deepseek.com/api_keys>

## Install

```sh
git clone https://github.com/DDDMUC/dsh-free-search.git
dsh plugin --profile web add /path/to/dsh-free-search
```

Then restart:

```sh
dsh web
```

## Usage

### Web settings (recommended)

After install, open **Settings → Plugins → Configurable** tab → **Free Search** card (official settings page, no dsh-web-ui needed):

- **Search engine**: dropdown to switch engines, save to apply
- **API keys**: fill keys for Exa / Perplexity / DeepSeek (password inputs; after save the UI only shows "configured")

### Config file

Configuration lives in `~/.dsh/settings.yaml`:

```yaml
free-search:
  provider: bing              # ddg / ddg-lite / bing / searxng / exa / perplexity / deepseek-official
  bingMarket: zh-CN           # Bing market
  region: cn-zh               # DuckDuckGo region (optional)
  searxngInstances:           # custom SearXNG instances (optional)
    - https://your-instance.example
  exaApiKey: ...              # or configure via the settings page
  perplexityApiKey: ...
  deepseekApiKey: ...
```

### Have the agent test all engines

Ask the agent to "test all search engines" — it calls the `free_search_test` tool and reports:

```
Search engine test:
- ddg: FAIL - DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary) - Bing works
- bing: OK (2 results, e.g. "DeepSeek Harness developer preview...")
- exa: FAIL - EXA_API_KEY not configured
```

### Fetch page content (web_fetch)

After search, ask the agent to **read a page** (e.g. "open the first link and summarize it"). The `web_fetch` tool is enabled (official `dsh-web-fetch-http` provider):

- Follows redirects, decodes body (HTML to text)
- Timeout and size limits
- ⚠️ Note: `web_fetch` has no SSRF protection — the agent could reach internal addresses. Use deliberately.

## Local engine switcher (tools/)

Prefer a local tool over the web UI? The `tools/` directory ships a zero-dependency switcher:

- **`启动搜索引擎切换器.cmd`** (Windows) — double-click to start a local Node server (`http://127.0.0.1:4789`) and open the picker page in your browser
- **`switch-engine.html`** — the picker UI: shows the current engine, one-click switch
- **`server.mjs`** — local server that reads/writes `~/.dsh/profiles/web/cordis.patch.yml`
- **`switch-engine.ps1`** — headless CLI: `powershell -File tools/switch-engine.ps1 -Engine bing`

Restart `dsh web` after switching.

> The settings card mounts on the official `settings.plugin.item` slot (built into dsh); config reads/writes go through the plugin's own bridge. **No dsh-web-ui dependency — the plugin works standalone.**

## Proxy note

DuckDuckGo and some engines may be blocked and need a proxy. Node.js `fetch` does not use the system proxy by default — set these environment variables for the dsh process (Node 24+):

```sh
export NODE_USE_ENV_PROXY=1
export HTTPS_PROXY=http://127.0.0.1:7897   # your proxy
export HTTP_PROXY=http://127.0.0.1:7897
```

## How it works

- `lib/index.js`: host side. Implements `WebSearchProvider` (`id` / `available()` / `search()`), multi-engine routing + auto-failover; registers the `free-search` settings namespace; serves the `/api/dsh-free-search-settings` read/write bridge; registers the `free_search_test` tool; injects the engine list into the system prompt.
- `lib/client.js`: browser side. React settings card (engine select + key inputs), mounted on the official `settings.plugin.item` slot (Settings → Plugins → Configurable), no dsh-web-ui dependency.
- `cordis.patch.yml`: plugin loader config.

## License

MIT
