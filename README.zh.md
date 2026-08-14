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

- **零成本** —— DuckDuckGo HTML 搜索，无需 key、无需注册
- **零配置** —— 安装即自动注册
- **区域支持** —— 可选 `kl` 区域参数（如 `cn-zh`、`us-en`）
- **干净集成** —— 实现官方 `WebSearchProvider` seam 接口
- **可组合** —— 与其他 provider（exa / perplexity / deepseek-official）共存，用 `web.searchProvider` 切换

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
    searchProvider: ddg
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

直接让 agent 搜索即可，例如："帮我搜索 DeepSeek Harness 的最新消息"。`web_search` 工具会自动走 DuckDuckGo。

## 与其他 provider 对比

| Provider | 费用 | 需要 key | 质量 |
|---|---|---|---|
| `ddg`（本插件） | 免费 | 否 | 一般 |
| `exa`（官方） | 付费 | `EXA_API_KEY` | 好 |
| `perplexity`（官方） | 付费 | `PERPLEXITY_API_KEY` | 好 |
| `deepseek-official`（内置） | 按 token 计费 | `DEEPSEEK_API_KEY` | 最好（原生搜索） |

随时改 `web.searchProvider` 切换，无需重装。

## 工作原理

`lib/index.js` 实现 `WebSearchProvider` 接口（`id` / `available()` / `search()`），请求 `https://html.duckduckgo.com/html/?q=...`，解析结果块，返回规范化结果（`url`、`title`、`snippet`、`publishedAt`）。`cordis.patch.yml` 插入 loader 条目，让 dsh 把它挂载进 `ctx.web` seam。

## License

MIT
