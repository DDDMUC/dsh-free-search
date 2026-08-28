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

## DSH 0.1.2-alpha.1 Adoption Verification

Re-run of the same seam checks against the newest DSH pre-release
(`dsh-v0.1.2-alpha.1`), using a separately built monorepo snapshot
(`apps/cli/lib/bin.js`) and an independent DSH_HOME.

| Check | Result on alpha.1 |
|-------|-------------------|
| `dsh plugin add dsh-free-search@0.4.15` (real npm) | installed |
| `--dump-config` → `web.searchProvider` | `ddg` (takeover works) |
| settings bridge `POST /api/dsh-free-search-settings/describe` | `ok:true, ns:free-search` |
| raw search, no API key | `ok:true provider:bing cache:miss sources:2 first:https://deepseek.com/en/index.html` |
| uninstall → `--dump-config` | `searchProvider` restored to `deepseek-official`; plugin dir removed |

**One seam to watch on alpha.1**: the installed plugin's **client bundle
routing** returned `404` for `/plugins/dsh-free-search/client.js`. alpha.1
splits the conversation/UI client into import-by-layer modules (per the
release notes), so the client-bundle assembly path changed. The host-side
seam (bundle patch takeover, settings bridge, search chain, uninstall rollback)
passes; the client-assembly path is the part alpha.1 maintainers are actively
re-working. Plugin code change is **not** required for host/settings/search to
work on alpha.1 — only the client asset resolution is pending the alpha.1
client-routing contract.

## Disclosure

Installing this plugin takes over the host default web search provider
(`web.searchProvider` → `ddg`, this plugin's provider id); uninstalling
restores the previous default (verified above). Paid engines
(Exa/Tavily/Keenable/Perplexity/DeepSeek) require their own API key; free
engines (Bing/DuckDuckGo/AnySearch/SearXNG) work without any key — the default
engine chain never fails from a missing key.