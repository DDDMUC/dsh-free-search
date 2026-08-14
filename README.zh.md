# dsh-free-search

**DeepSeek Harness 免费搜索插件 —— 无需 API key，零成本。**

一个给 DeepSeek Harness (dsh) 添加 DuckDuckGo 搜索 provider 的插件，注册进 `ctx.web` seam。内置 `web_search` 工具自动选用。零配置、零成本、零 key。

[English](./README.md) | 中文

## 为什么需要它

dsh 默认的搜索 provider 依赖 DeepSeek 官方 API key（`DEEPSEEK_API_KEY`）。如果你：
- 没有（或不想用）DeepSeek 官方 key，
- 用的是 opencode-go 这类网关（其 OpenAI 兼容端点不支持 `web_search` 工具），

……那么内置搜索必然失败，agent 会告诉你"无法联网"。

这个插件用免费的 DuckDuckGo HTML 搜索端点解决这个问题。

## 特性

- **零成本** —— 4 个免费搜索源，无需 key、无需注册
- **4 个引擎可选**：DuckDuckGo（html/lite）、Bing、Mojeek
- **零配置** —— 安装即自动注册全部引擎
- **随时切换** —— 通过 `web.searchProvider` 选择引擎
- **区域支持** —— 每个引擎可配区域/市场参数
- **干净集成** —— 实现官方 `WebSearchProvider` seam 接口
- **可组合** —— 与其他 provider（exa / perplexity / deepseek-official）共存

## 引擎

| id | 引擎 | 说明 |
|---|---|---|
| `ddg` | DuckDuckGo (html) | 默认。支持 `region` 区域参数 |
| `ddg-lite` | DuckDuckGo (lite) | 轻量页面，不支持区域 |
| `bing` | Bing | 支持 `bingMarket`（默认 zh-CN） |
| `mojeek` | Mojeek | 隐私友好，偏英文 |

默认全部启用。在插件 config 里用 `engines.<id>: false` 可关闭任意引擎。

## 安装

```sh
git clone https://github.com/<你的用户名>/dsh-free-search.git
dsh plugin --profile web add /path/to/dsh-free-search
```

然后重启：

```sh
dsh web
```

## 设为默认 provider

在 profile 的 `cordis.patch.yml`（如 `~/.dsh/profiles/web/cordis.patch.yml`）里加：

```yaml
- id: web
  config:
    searchProvider: ddg   # 或：ddg-lite | bing | mojeek
```

或设置环境变量 `DSH_WEB_SEARCH_PROVIDER=ddg`。

> **国内用户注意**：DuckDuckGo 需要代理才能访问，而 Node.js 的 `fetch` 默认不走系统代理。需要给 dsh 进程设置（Node 24+）：
>
> ```sh
> export NODE_USE_ENV_PROXY=1
> export HTTPS_PROXY=http://127.0.0.1:7897   # 你的代理地址
> export HTTP_PROXY=http://127.0.0.1:7897
> ```

## 使用

直接让 agent 搜索即可，例如："帮我搜索 DeepSeek Harness 的最新消息"。`web_search` 工具会自动走你配置的搜索引擎。

## 引擎切换工具（本地 UI）

不想手改 YAML？`tools/` 目录附带了一个本地切换小工具：

- **`tools/启动搜索引擎切换器.cmd`**（Windows）——双击启动本地 Node 服务（`http://127.0.0.1:4789`）并自动打开浏览器选择页面。
- **`tools/switch-engine.html`** —— 选择页面：显示当前引擎，点选新引擎，一键写入配置。
- **`tools/server.mjs`** —— 本地服务，负责读写 `~/.dsh/profiles/web/cordis.patch.yml`。
- **`tools/switch-engine.ps1`** —— 无界面命令行版：`powershell -File tools/switch-engine.ps1 -Engine bing`。

切换后重启 `dsh web` 生效。

> 注意：dsh rc.6 的网页设置页不提供第三方插件配置表单（设置白名单写死在官方代码里），所以用这个本地工具绕开限制，效果一致还更直观。

## 与其他 provider 对比

| Provider | 费用 | 需要 key | 质量 |
|---|---|---|---|
| `ddg` / `ddg-lite` / `bing` / `mojeek`（本插件） | 免费 | 否 | 一般 |
| `exa`（官方） | 付费 | `EXA_API_KEY` | 好 |
| `perplexity`（官方） | 付费 | `PERPLEXITY_API_KEY` | 好 |
| `deepseek-official`（内置） | 按 token 计费 | `DEEPSEEK_API_KEY` | 最好（原生搜索） |

随时改 `web.searchProvider` 切换，无需重装。

## 工作原理

`lib/index.js` 实现 `WebSearchProvider` 接口（`id` / `available()` / `search()`），请求 `https://html.duckduckgo.com/html/?q=...`，解析结果块，返回规范化结果（`url`、`title`、`snippet`、`publishedAt`）。`cordis.patch.yml` 插入 loader 条目，让 dsh 把它挂载进 `ctx.web` seam。

## License

MIT
