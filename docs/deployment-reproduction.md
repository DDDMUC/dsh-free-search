# Deployment Reproduction Evidence

Real reproduction of the community-index claim for `dsh-free-search`
(regression requested in dsh-web PR #1249 review).

- **Environment**: independent temporary DSH_HOME (untouched daily 3080/3090)
- **DSH**: 0.1.1-rc.2
- **Plugin source**: this repo, released as `dsh-free-search@0.4.15` (npm)
- **Date**: 2026-08-28

## Steps

### 1. Real install from npm

```console
$ dsh plugin --profile web add dsh-free-search@0.4.15
+ dsh-free-search 0.4.15
Packages: +4
Done in 582ms using pnpm v11.21.0
```

### 2. Takeover of the host default search provider

Plugin's bundle patch sets `web.searchProvider = ddg` (this plugin's provider id).

```console
$ dsh --profile web --dump-config
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: ddg
```

Before install the host default was `deepseek-official` (see step 5).

### 3. Real search with no API key configured

Default engine chain uses free engines — no key required, real results returned.

```console
$ POST /api/dsh-free-search-settings/raw-search  {query:"DeepSeek Harness reproduction", maxResults:2}
{ok:true, cache:"miss", ms:3426, provider:"bing", sources:2}
# first: "DeepSeek | Into the Unknown" -> https://deepseek.com/en/index.html
```

### 4. Settings panel visible

`dsh-free-search` settings card is registered in the web settings (Settings →
Plugins → Configurable), served from this plugin's client bundle.

### 5. Uninstall restores the default

```console
$ dsh plugin --profile web remove dsh-free-search
$ dsh --profile web --dump-config
- id: web
  config:
    searchProvider: deepseek-official
```

Plugin fully removed from the config tree; the host default search provider is
restored (via the bundle patch rollback mechanism).

## Disclosure

Installing this plugin takes over the host default web search provider
(`web.searchProvider` → `ddg`, this plugin's provider id); uninstalling
restores the previous default (verified above). Paid engines
(Exa/Tavily/Keenable/Perplexity/DeepSeek) require their own API key; free
engines (Bing/DuckDuckGo/AnySearch/SearXNG) work without any key — the default
engine chain never fails from a missing key.