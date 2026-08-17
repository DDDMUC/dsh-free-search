# dsh-free-search

**DeepSeek Harness 免费搜索插件 —— 无需 API key，零成本，多引擎可切换。** 一个给 DeepSeek Harness (dsh) 添加多引擎搜索 provider 的插件，注册进 `ctx.web` seam。内置 `web_search` 工具自动选用，支持网页设置页切换引擎、配置 API key、一键测试所有引擎。

[English](./README.en.md) | 中文

<div align="center">

![免费引擎设置 (Bing)](https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-free1.png)

<sub>▲ 免费引擎（以Bing为例）</sub>

</div>

## 为什么需要它

dsh 默认的搜索 provider 依赖 DeepSeek 官方 API key（`DEEPSEEK_API_KEY`）。如果你：
- 没有（或不想用）DeepSeek 官方 key，
- 用的是 opencode-go 这类网关（其 OpenAI 兼容端点不支持 `web_search` 工具），

……那么内置搜索必然失败，agent 会告诉你"无法联网"。

这个插件提供多个免费引擎 + 自动回退，彻底摆脱 DeepSeek 官方 key 的依赖。

## 特性

- **零成本** —— 多个免费引擎，无需 key、无需注册
- **多引擎可选**：DuckDuckGo（html/lite）、Bing、SearXNG（元搜索，支持自定义实例）、Exa、Perplexity、DeepSeek 官方
- **网页设置页** —— 引擎切换 + API key 配置（UI 中 key 脱敏显示"已配置"）
- **引擎测试工具** —— `free_search_test`，让 agent 一键测试所有引擎可用性
- **自动回退** —— 免费引擎失败/限流时自动切换到下一个可用引擎
- **系统提示词注入** —— agent 知道当前用哪个引擎、哪些需要 key
- **免费标注** —— 设置页中免费引擎带绿色 `FREE` 徽章，付费引擎带橙色 `API KEY` 徽章
- **网页抓取（web_fetch）** —— 让 agent 抓取网页内容（官方 `dsh-web-fetch-http` provider，纯 JS，零额外依赖）
- **平台搜索（platform_search）** —— 搜 GitHub / V2EX / B站（公开 API，零依赖）
- **干净集成** —— 实现官方 `WebSearchProvider` seam 接口，与官方插件共存

## 引擎列表

| id | 引擎 | 费用 | 说明 |
|---|---|---|---|
| `ddg` | DuckDuckGo HTML | 免费 | 偶发限流（反爬），解封自动恢复 |
| `ddg-lite` | DuckDuckGo Lite | 免费 | 轻量版，同上 |
| `bing` | Bing | 免费 | **默认引擎**，最稳定，中文优化（zh-CN） |
| `anysearch` | AnySearch AI | 免费 | AI 搜索，无 key（匿名额度） |
| `searxng` | SearXNG 元搜索 | 免费 | 多实例自动切换，支持自定义实例 |
| `exa` | Exa | 免费 | **无 key 也可用**（MCP 匿名），配 key 提升额度 |
| `perplexity` | Perplexity | 付费 | 需 `PERPLEXITY_API_KEY` |
| `deepseek-official` | DeepSeek 官方 | 付费 | 需 `DEEPSEEK_API_KEY` |

- **默认引擎为 `bing`**（免费且最稳定），安装后开箱即用。
- 免费引擎失败会自动回退到其他免费引擎；付费引擎缺 key 或 key 无效时报清晰错误，不会静默切换。
- **设置页有官网链接**：免费引擎显示"访问官网 →"，付费引擎显示"获取 API Key →"（新标签页打开）：
  - Exa：<https://dashboard.exa.ai/api-keys>
  - Perplexity：<https://www.perplexity.ai/settings/api>
  - DeepSeek：<https://platform.deepseek.com/api_keys>

### 为什么 AnySearch 免费？

AnySearch（anysearch.com）是一个 AI 搜索网关，提供**匿名的公共搜索额度**——通过其 `v1/search` REST 接口可以直接调用，无需注册或 API key。额度有限流（适合日常搜索），但作为免费引擎之一，与其他免费引擎互相回退，体验稳定。

Exa 同理：其公开 MCP 端点（`mcp.exa.ai/mcp`）支持匿名调用，因此不配置 key 也能用；配置 `EXA_API_KEY` 后可获得更高额度。

## 安装

```sh
git clone https://github.com/DDDMUC/dsh-free-search.git
dsh plugin --profile web add /path/to/dsh-free-search
```

然后重启：

```sh
dsh web
```

### 依赖说明

插件对 `@deepseek-ai/dsh-settings` 和 `@deepseek-ai/dsh-tools` 使用 `peerDependencies`，这是刻意的：DSH 运行时必须使用安装树中的唯一实例。请通过 `dsh plugin --profile <profile> add ...` 安装插件，不要把 DSH 核心包复制进 profile 的本地 `node_modules`；重复副本会导致工具调度器失效。

## 使用

### 网页设置（推荐）

安装后，打开 **设置 → 插件 → 可配置** 标签页 → **Free Search** 卡片（官方设置页）：

- **Search engine**：下拉框切换引擎，保存即生效
- **API keys**：为 Exa / Perplexity / DeepSeek 填写 key（密码框，保存后只显示"已配置"）

<table align="center" style="border: none; border-collapse: collapse;">
  <tr style="border: none;">
    <td align="center" width="50%" style="border: none; padding: 6px;">
      <a href="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-free.png">
        <img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-free.png" alt="免费引擎设置" width="100%" />
      </a>
      <br>
      <sub>▲ <b>免费引擎</b>（显示绿色 FREE 徽章与官网链接）</sub>
    </td>
    <td align="center" width="50%" style="border: none; padding: 6px;">
      <a href="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-apikey.png">
        <img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-apikey.png" alt="付费引擎设置" width="100%" />
      </a>
      <br>
      <sub>▲ <b>付费/API Key 引擎</b>（显示橙色 API KEY 徽章与获取链接）</sub>
    </td>
  </tr>
</table>


### 命令行 / 配置文件

配置存在 `~/.dsh/settings.yaml`：

```yaml
free-search:
  provider: bing              # ddg / ddg-lite / bing / searxng / exa / perplexity / deepseek-official
  bingMarket: zh-CN           # Bing 市场
  region: cn-zh               # DuckDuckGo 区域（可选）
  searxngInstances:           # 自定义 SearXNG 实例（可选）
    - https://your-instance.example
  exaApiKey: ...              # 或通过设置页填写
  perplexityApiKey: ...
  deepseekApiKey: ...
```

### 让 agent 测试所有引擎

对 agent 说"测试一下所有搜索引擎"，它会调用 `free_search_test` 工具，逐个测试并报告：

```
Search engine test:
- ddg: FAIL - DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary) - Bing works
- bing: OK (2 results, e.g. "DeepSeek Harness developer preview...")
- exa: FAIL - EXA_API_KEY not configured
```

### 抓取网页内容（web_fetch）

搜索到 URL 后，可以让 agent **读取网页全文**（如"打开第一个链接看看内容"）。`web_fetch` 工具已启用（官方 `dsh-web-fetch-http` provider）：

- 自动跟随重定向、解码正文（HTML 转文本）
- 支持超时和大小限制
- ⚠️ 注意：`web_fetch` 无 SSRF 防护，agent 理论上可访问内网地址——按需使用

### 平台搜索（platform_search）

让 agent 搜特定平台，如"在 GitHub 上搜 deepseek harness"、"看看 B站有什么相关视频"、"V2EX 上关于 dsh 的讨论"。`platform_search` 工具支持：

| 平台 | 用途 |
|---|---|
| `github` | GitHub 仓库搜索（API，免费无 key） |
| `v2ex` | V2EX 热门/相关主题 |
| `bilibili` | B站视频/内容搜索（公开接口） |

全部走公开 API，零外部依赖，开箱即用。

## 本地引擎切换工具（tools/）

`tools/` 目录附带了一个本地切换小工具（零依赖）：

- **`启动搜索引擎切换器.cmd`**（Windows）——双击启动本地 Node 服务（`http://127.0.0.1:4789`）并自动打开浏览器选择页面
- **`switch-engine.html`** —— 选择页面：显示当前引擎，点选新引擎，一键写入配置
- **`server.mjs`** —— 本地服务，负责读写 `~/.dsh/profiles/web/cordis.patch.yml`
- **`switch-engine.ps1`** —— 无界面命令行版：`powershell -File tools/switch-engine.ps1 -Engine bing`

切换后重启 `dsh web` 生效。

> 配置卡片挂在官方设置页的 `settings.plugin.item` 插槽（dsh 自带），配置读写走插件自建 bridge，**不依赖 dsh-web-ui**，插件可独立使用。

## 代理说明（国内用户）

DuckDuckGo 等引擎可能需要代理才能访问，而 Node.js 的 `fetch` 默认不走系统代理。需要给 dsh 进程设置（Node 24+）：

```sh
export NODE_USE_ENV_PROXY=1
export HTTPS_PROXY=http://127.0.0.1:7897   # 你的代理地址
export HTTP_PROXY=http://127.0.0.1:7897
```

Windows 用户：桌面快捷方式已内置此配置（`set NODE_USE_ENV_PROXY=1&& set HTTPS_PROXY=...`）。

## 工作原理

- `lib/index.js`：host 端。实现 `WebSearchProvider`（`id` / `available()` / `search()`），多引擎路由 + 自动回退；注册 `free-search` settings namespace；提供 `/api/dsh-free-search-settings` 读写桥；注册 `free_search_test` 工具；注入引擎清单到系统提示词。
- `lib/client.js`：浏览器端。React 配置卡片（引擎选择 + key 输入），挂载到官方设置页的 `settings.plugin.item` 插槽（设置 → 插件 → 可配置），不依赖 dsh-web-ui。
- `cordis.patch.yml`：插件 loader 配置。

## License

MIT
