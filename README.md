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

- **Zero cost** — DuckDuckGo HTML search, no API key, no registration
- **Zero config** — install and it registers automatically
- **Region support** — optional `kl` region parameter (e.g. `cn-zh`, `us-en`)
- **Clean integration** — implements the official `WebSearchProvider` seam interface
- **Composable** — coexists with other providers (exa / perplexity / deepseek-official); pick one via `web.searchProvider`

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
    searchProvider: ddg
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

Just ask the agent to search the web, e.g. *"search for the latest DeepSeek Harness news"*. The `web_search` tool routes to DuckDuckGo automatically.

## Compare with other providers

| Provider | Cost | Key needed | Quality |
|---|---|---|---|
| `ddg` (this plugin) | Free | No | OK |
| `exa` (official) | Paid | `EXA_API_KEY` | Good |
| `perplexity` (official) | Paid | `PERPLEXITY_API_KEY` | Good |
| `deepseek-official` (built-in) | Paid per token | `DEEPSEEK_API_KEY` | Best (native web search) |

Switch anytime by changing `web.searchProvider` — no reinstall needed.

## How it works

`lib/index.js` implements the `WebSearchProvider` interface (`id` / `available()` / `search()`), calls `https://html.duckduckgo.com/html/?q=...`, parses the result blocks, and returns normalized sources (`url`, `title`, `snippet`, `publishedAt`). The `cordis.patch.yml` inserts a loader entry so dsh mounts it into the `ctx.web` seam.

## License

MIT
