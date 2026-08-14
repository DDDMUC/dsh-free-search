# dsh-free-search

**Free web search provider for DeepSeek Harness — no API key, no cost.**

A plugin that adds a DuckDuckGo-backed search provider to DeepSeek Harness (dsh), registered into the `ctx.web` seam. The built-in `web_search` tool picks it up automatically. Zero configuration, zero cost, zero keys.

English | [中文](./README.zh.md)

## Why

dsh ships a DeepSeek-official search provider by default, which requires a valid `DEEPSEEK_API_KEY`. If you:
- don't have (or don't want) a DeepSeek official API key,
- already use a gateway like opencode-go (which does not expose a `web_search` tool),

...then the built-in search always fails and the agent tells you "I can't access the internet."

This plugin fixes that with a free, keyless backend: DuckDuckGo's HTML search endpoint.

## Features

- **Zero cost** — 4 free backends, no API key, no registration
- **4 engines to choose from**: DuckDuckGo (html/lite), Bing, Mojeek
- **Zero config** — install and all engines register automatically
- **Switch anytime** — pick your engine via `web.searchProvider`
- **Region support** — optional region/market parameters per engine
- **Clean integration** — implements the official `WebSearchProvider` seam interface
- **Composable** — coexists with other providers (exa / perplexity / deepseek-official)

## Engines

| id | Engine | Notes |
|---|---|---|
| `ddg` | DuckDuckGo (html) | Default. Region param via `region` |
| `ddg-lite` | DuckDuckGo (lite) | Lighter markup, region not supported |
| `bing` | Bing | Market via `bingMarket` (default zh-CN) |
| `mojeek` | Mojeek | Privacy-focused, English-centric |

All engines are enabled by default. Disable any with `engines.<id>: false` in the plugin config.

## Install

```sh
git clone https://github.com/<your-username>/dsh-free-search.git
dsh plugin --profile web add /path/to/dsh-free-search
```

Then restart:

```sh
dsh web
```

## Make it the default provider

Add this to your profile's `cordis.patch.yml` (e.g. `~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- id: web
  config:
    searchProvider: ddg   # or: ddg-lite | bing | mojeek
```

Alternatively set the environment variable `DSH_WEB_SEARCH_PROVIDER=ddg`.

> **Note for users behind the GFW / a proxy**: DuckDuckGo is blocked in mainland China. Node.js `fetch` does not use the system proxy by default — set these environment variables for the dsh process (Node 24+):
>
> ```sh
> export NODE_USE_ENV_PROXY=1
> export HTTPS_PROXY=http://127.0.0.1:7897   # your proxy
> export HTTP_PROXY=http://127.0.0.1:7897
> ```

## Usage

Just ask the agent to search the web, e.g. *"search for the latest DeepSeek Harness news"*. The `web_search` tool routes to the configured engine automatically.

## Engine switcher tool (local UI)

Don't want to edit YAML by hand? The `tools/` directory ships a tiny local switcher:

- **`tools/启动搜索引擎切换器.cmd`** (Windows) — double-click to start a local Node server (`http://127.0.0.1:4789`) and open the picker page in your browser.
- **`tools/switch-engine.html`** — the picker UI: shows the current engine, lets you pick a new one, and writes the config with one click.
- **`tools/server.mjs`** — the local server that reads/writes `~/.dsh/profiles/web/cordis.patch.yml`.
- **`tools/switch-engine.ps1`** — headless PowerShell alternative: `powershell -File tools/switch-engine.ps1 -Engine bing`.

After switching, restart `dsh web` for the change to take effect.

> Note: dsh rc.6 does not expose third-party plugin config forms in its web Settings page (the settings allowlist is hard-coded), so this tool works around that with a local loopback server instead.

## Compare with other providers

| Provider | Cost | Key needed | Quality |
|---|---|---|---|
| `ddg` / `ddg-lite` / `bing` / `mojeek` (this plugin) | Free | No | OK |
| `exa` (official) | Paid | `EXA_API_KEY` | Good |
| `perplexity` (official) | Paid | `PERPLEXITY_API_KEY` | Good |
| `deepseek-official` (built-in) | Paid per token | `DEEPSEEK_API_KEY` | Best (native web search) |

Switch anytime by changing `web.searchProvider` — no reinstall needed.

## How it works

`lib/index.js` implements the `WebSearchProvider` interface (`id` / `available()` / `search()`), calls `https://html.duckduckgo.com/html/?q=...`, parses the result blocks, and returns normalized sources (`url`, `title`, `snippet`, `publishedAt`). The `cordis.patch.yml` inserts a loader entry so dsh mounts it into the `ctx.web` seam.

## License

MIT
