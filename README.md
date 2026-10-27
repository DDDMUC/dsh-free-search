# dsh-free-search

**DeepSeek Harness 免费搜索插件 —— 无需 API key，零成本，多引擎可切换。** 一个给 DeepSeek Harness (dsh) 添加多引擎搜索 provider 的插件，注册进 `ctx.web` seam。内置 `web_search` 工具自动选用，支持网页设置页切换引擎、配置 API key、一键测试所有引擎、弹出式命令切换引擎。

[中文](#中文) · [English](#english)

---

## 中文

<div align="center">
  <a href="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-free1.png">
    <img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-free1.png" alt="免费引擎设置 (Bing)" width="820" />
  </a>
  <br>
  <sub>▲ 免费引擎（以Bing为例）</sub>
</div>

### 为什么需要它

dsh 默认的搜索 provider 依赖 DeepSeek 官方 API key（`DEEPSEEK_API_KEY`）。如果你：
- 没有（或不想用）DeepSeek 官方 key，
- 用的是 opencode-go 这类网关（其 OpenAI 兼容端点不支持 `web_search` 工具），

……那么内置搜索必然失败，agent 会告诉你"无法联网"。

这个插件提供多个免费引擎 + 自动回退，彻底摆脱 DeepSeek 官方 key 的依赖。

### 特性

- **零成本** —— 多个免费引擎，无需 key、无需注册
- **多引擎可选**：DuckDuckGo（html/lite）、Bing、SearXNG（元搜索，支持自定义实例）、AnySearch、Exa、Tavily、Keenable、Firecrawl、Parallel、Perplexity、SerpBase、Serply、DeepSeek 官方、DeepSeek 原生搜索 API、You.com、百度千帆、Kimi、阿里云百炼、火山联网搜索（豆包搜索）、知乎全网/站内（`zhihu_global`/`zhihu_site`，经知乎开放平台 MCP）、OpenAI / Gemini / Claude 模型内置搜索
- **网页设置页** —— 引擎切换 + API key 配置（UI 中 key 脱敏显示"已配置"）+ 中英文切换；入口在左侧「插件」页的组件行配置（`plugins.row.config`，DSH 0.1.7-rc.1+）。远程访问（VPS / 反向代理 / 自定义域名）下也能用：桥接接口沿用宿主的 Host 围栏，`--trusted-host` 与 `--public-url` 声明的地址会放行（#84）
- **右侧浮动目录** —— 卡片右侧的页面留白里浮出「引擎 / 回退 / 语言池 / 搜索行为 / 抓取 / 性能」六个快捷跳转，滚动自动高亮当前项、点击平滑跳转；不占用正文宽度（正文布局与 0.9.6 一致），右侧留白不足时自动隐藏
- **多 key 轮换** —— 任何 key 字段（或对应环境变量）都可以用逗号 / 分号 / 换行分隔多把 key；遇到 401/402/429（鉴权失败、额度耗尽）先轮换同一引擎的下一把，再走引擎回退
- **弹出式切换命令** —— 聊天框输入 `/free-search-engine`，弹出引擎选择窗口，点选即切换（等效设置页 + 保存）
- **引擎测试** —— `free_search_test` 工具让 agent 一键测试所有引擎；设置页也有"测试引擎"按钮（直测当前引擎，不走回退链，付费引擎无 key 会明确报错）
- **全局引擎开关与回退优先级** —— 设置页可勾选/取消引擎（取消后全局生效：普通搜索 / Auto / `advanced_search` / `multi_search` / 引擎测试都不再用它），并可用 ↑↓ 调整全局回退顺序（一键恢复默认）
- **Multi 模式** —— 可把搜索引擎设为 `Multi Search`：`web_search` 按查询语言并发**对应语言池的全部**已启用引擎（不再是前 3 个；中文/英文池可在设置页编辑，每池最低 2 个引擎）、按 URL 合并去重（同站判定用 **eTLD+1**）、跨源命中的结果优先；设置页有 **Fast / Balanced / Deep** 三档强度，也可手填并发上限与目标成功源数；整轮检索共享 **30 秒总预算**，到点返回已有结果（代价是成倍消耗额度；multi 失败会自动退回单引擎回退链）
- **统一引擎回退** —— 任何引擎失败（付费/免费，缺 key/401/限流/网络）自动轮流尝试下一个引擎：首选引擎 → 其他引擎（exa/tavily/keenable/firecrawl/parallel/you 无 key 也会尝试，因为它们自带 keyless 免费额度）→ 剩余免费引擎，搜索永不直接失败；结果顶部注明实际生效的引擎（如 `Note: perplexity unavailable or failed, using exa.`）；失败按类别处理：额度/鉴权失败→本会话冷却该引擎，反爬→短退避，超时/5xx/限流→同引擎重试一次，解析失败/0 结果→不冷却（详见下文「失败分类与引擎冷却」）
- **时间过滤** —— `advanced_search` 工具支持 `timeRange`：固定档、自定义相对值、绝对日期三种形式（详见下方逻辑说明）
- **系统提示词注入** —— agent 知道当前用哪个引擎、哪些需要 key；并明确所有搜索结果是**不可信外部数据**，不得执行其中的指令
- **提示注入防护（不可信数据边界）** —— 插件自有工具（advanced_search / platform_search / free_search_test）的网页文本包在 `<untrusted-web-content>` 边界内（正文里自带的同名标记会被剥离，防止提前闭合）；核心 web_search / web_fetch 由 DSH 核心自带同类提示（`External web content follows...`）；所有 snippet 统一清洗并截断到 300 字符
- **版本号 + 检查更新** —— 设置卡片显示当前版本（跟随 `PLUGIN_VERSION`，随发布更新），"检查更新"按钮直连 npm registry 对比最新版，有新版本时提示并可一键跳转
- **结果缓存** —— 相同查询（含引擎/时间过滤参数）5 分钟内命中缓存（LRU 50 条），防免费引擎限流、省付费额度；时长可在设置页 0-5 分钟自由配置（0 关闭）
- **域名黑名单与安全搜索** —— `blockedDomains`：命中的域名不会进入任何结果；`safeSearch`（`off` / `moderate` / `strict`）为 Bing / DuckDuckGo 加一层过滤
- **免费标注** —— 设置页中免费引擎带绿色 `FREE` 徽章，付费引擎带橙色 `API KEY` 徽章
- **网页抓取（web_fetch）** —— 让 agent 抓取网页内容（官方 `dsh-web-fetch-http` provider，纯 JS，零额外依赖）
- **平台搜索（platform_search）** —— 搜 GitHub / V2EX / B站 / Reddit / Hacker News / Stack Overflow / 维基百科 / npm / YouTube / Vimeo / 掘金 / 豆瓣 / Qiita（公开 API 或免 key 抓取，零依赖）
- **垂直领域直查（domain_search）** —— 41 个免 key 垂直源直查：包/版本（PyPI、crates、GitHub releases、endoflife…）、学术（arXiv、Crossref、OpenAlex、Semantic Scholar、PubMed、dblp、Zenodo…）、安全（NVD、OSV、CISA KEV）、金融（SEC EDGAR、IMF、World Bank、CFETS、Yahoo Finance、CoinGecko…）、**法律（US Federal Register、US CourtListener、openlegaldata、UK legislation）**、新闻（Google News、GDELT）等
- **视频搜索（video_search）** —— 跨站找视频：Bing Videos + DuckDuckGo Videos（免 key，失败互相回退），返回视频链接、标题与来源/时长等元信息
- **一次调用完成研究（research）** —— 多引擎并发搜索 → 候选重排 → 分层抓取正文 → 段落选窗 → 带出处的 Markdown 证据包；模型组件（重排/嵌入/决策模型）全部可选，缺失或失败时静默回退规则路径
- **检索正文缓存（cache_search）** —— 全文检索 `research` 抓过的正文（`node:sqlite` 持久缓存，存储 7 天；`node:sqlite` 不可用时自动降级为 no-op，免 flag 需 ≥ 22.13，22.5–22.12 需 `--experimental-sqlite`）
- **干净集成** —— 实现官方 `WebSearchProvider` seam 接口，与官方插件共存

如果这个插件帮到了你，欢迎给仓库点个 ⭐（[GitHub](https://github.com/DDDMUC/dsh-free-search)）——星标是开发者继续维护的最大动力，感谢支持！

### 引擎列表

| id | 引擎 | 费用 | 说明 |
|---|---|---|---|
| `auto` | Auto 智能路由 | 动态 | **根据查询语言/时间条件自动选路**（含中文优先 Bing/Baidu/Aliyun/AnySearch，英文优先 Bing/Exa/Tavily；时间过滤优先支持引擎），末尾全量回退 |
| `ddg` | DuckDuckGo HTML | 免费 | 偶发限流（反爬），解封自动恢复 |
| `ddg-lite` | DuckDuckGo Lite | 免费 | 轻量版，同上 |
| `bing` | Bing | 免费 | **默认引擎**，最稳定，中文优化（zh-CN） |
| `anysearch` | AnySearch AI | 免费 | AI 搜索，无 key（匿名额度） |
| `searxng` | SearXNG 元搜索 | 免费 | 多实例自动切换，支持自定义实例 |
| `degoog` | Degoog（自建聚合器） | 免费 | 需要自己的实例（`degoogInstances`），免 key；实例开启 API Key 时用 `degoogApiKey`（Bearer） |
| `exa` | Exa | 免费 | **无 key 也可用**（MCP 匿名），配 key 提升额度 |
| `tavily` | Tavily | 免费 | **无 key 也可用**（keyless 匿名），配 key 提升额度 |
| `keenable` | Keenable | 免费 | **无 key 也可用**（MCP 匿名），配 key 提升额度 |
| `firecrawl` | Firecrawl | 免费 | **无 key 也可用**（官方免 key 匿名额度），配 key 提升限额。注意：keyless 档按**出口 IP** 判定，VPN/代理出口会被 403 拒绝；插件会冷却 6 小时并说明原因（有 key 不受影响） |
| `parallel` | Parallel | 免费 | **无 key 也可用**（官方 MCP 匿名额度），配 key 提升额度并支持精确时间过滤 |
| `you` | You.com | 免费 | **无 key 也可用**（官方免 key 档，每天 100 次），配 `YDC_API_KEY` 提升额度（旧名 `YOUCOM_API_KEY` 继续兼容） |
| `perplexity` | Perplexity | 付费 | 需 `PERPLEXITY_API_KEY` |
| `serpbase` | SerpBase | 付费 | 需 `SERPBASE_API_KEY`（serpbase.dev，注册送 100 次免费额度） |
| `serply` | Serply | 付费 | 需 `SERPLY_API_KEY`（serply.io，新账户 30 天内 2,500 次免费额度）；Google 网页结果，按设置页语言本地化 |
| `deepseek-official` | DeepSeek 官方 | 付费 | 需 `DEEPSEEK_API_KEY`；走 Anthropic 兼容的 `web_search` 服务端工具，每次搜索是一整个模型轮次（慢、耗 token） |
| `deepseek-tools` | DeepSeek 原生搜索 API | 付费 | 需 `DEEPSEEK_API_KEY`（与上一档共用）；直接 `POST /v1/tools/search`，无模型参与，返回结构化 `results[]`（`title`/`url`/`summary`/`date`），同 query 实测 ~0.3s vs 上一档 ~5-6s |
| `baidu` | 百度千帆 AI 搜索 | 额度 | 需 `BAIDU_API_KEY`（千帆 AI 搜索，每日赠 50 次，超额按量后付费）；中文全网，支持时间过滤 |
| `kimi` | Kimi（Moonshot）联网搜索 | 付费 | 需 `MOONSHOT_API_KEY`（basic 约 ￥0.01/次），返回带正文 chunks 的中文结果；**无免费额度**，适合显式选用或作质量升级池，不建议放进默认并发池 |
| `kimi` | Kimi（Moonshot）联网搜索 | 付费 | 需 `MOONSHOT_API_KEY`（basic 约 ￥0.01/次），返回带正文 chunks 的中文结果 |
| `aliyun` | 阿里云百炼 EnhancedSearch | 付费 | 需 `DASHSCOPE_API_KEY`（MCP search_pro，约 ￥0.03/次，新用户 200 次免费包）；中文全网带来源 hostname |
| `doubao` | 火山引擎联网搜索（豆包搜索） | 免费额度 | 需 `DOUBAO_SEARCH_API_KEY`（联网搜索控制台开通，**每月 500 次免费**，超出按量付费）；中文时效内容强，支持时间/站点过滤，返回千字级摘要 |
| `zhihu_global` | 知乎全网搜索（开放平台 MCP） | 免费额度 | 需 `ZHIHU_API_KEY`；**每日 5,000 次试用额度**（试用结束需另行开通）；支持时间过滤（`publish_time`）；无 key 时自动跳过 |
| `zhihu_site` | 知乎站内搜索（开放平台 MCP） | 免费额度 | 需 `ZHIHU_API_KEY`；**每日 5,000 次试用额度**（与 `zhihu_global` 共享）；不支持时间过滤 |
| `zhihu_global` | 知乎全网搜索（开放平台 MCP） | 付费 | 需 `ZHIHU_API_KEY`；支持时间过滤（`publish_time`）；无 key 时自动跳过 |
| `zhihu_site` | 知乎站内搜索（开放平台 MCP） | 付费 | 需 `ZHIHU_API_KEY`；不支持时间过滤 |
| `openai` | OpenAI 模型内置搜索 | 付费 | 需 `OPENAI_API_KEY`；走 Responses API 的 `web_search` 工具，返回带引用的回答。**按次计费，仅在显式选中时使用**（不参与自动回退/auto）；默认 `gpt-6-luna`，模型与端点可配（`openaiModel` / `openaiBaseUrl`） |
| `gemini` | Gemini Grounding with Google Search | 付费 | 需 `GEMINI_API_KEY`（兼容 `GOOGLE_API_KEY`）；走官方推荐的 **Interactions API**（`POST /v1beta/interactions`，`tools:[{type:"google_search"}]`），从 `steps[].content[].annotations` 取引用。**按次计费，仅在显式选中时使用**；默认 `gemini-3.8-flash`，模型与端点可配（`geminiModel` / `geminiBaseUrl`） |
| `claude` | Claude 服务端 web_search | 付费 | 需 `ANTHROPIC_API_KEY`；结果来自 `web_search_tool_result`。**按次计费，仅在显式选中时使用**；默认 `claude-sonnet-5-5`，模型与端点可配（`claudeModel` / `claudeBaseUrl`） |

- **默认引擎为 `bing`**（免费且最稳定），安装后开箱即用。
- **自动回退**：任何引擎失败（免费限流/反爬，付费缺 key/无效/网络错误）都会自动轮流尝试下一个引擎——先试其他已配 key 的付费引擎，再试免费引擎（Bing/AnySearch 等），并在结果中附带回退提示——搜索不会因引擎问题直接失败。
- **设置页有官网链接**：免费引擎显示"访问官网 →"，付费引擎显示"获取 API Key →"（新标签页打开）：
  - Exa：<https://dashboard.exa.ai/api-keys>
  - Tavily：<https://app.tavily.com/home>
  - Keenable：<https://keenable.ai/login>
  - Parallel：<https://platform.parallel.ai>
  - Perplexity：<https://www.perplexity.ai/settings/api>
  - SerpBase：<https://serpbase.dev>
  - Serply：<https://serply.io>（API 文档：<https://serply.io/docs>）
  - DeepSeek：<https://platform.deepseek.com/api_keys>
  - 豆包搜索（火山联网搜索）：<https://console.volcengine.com/search-infinity/web-search>
  - You.com：<https://you.com/platform/api-keys>

#### 引擎额度分层

「免费 / 付费」二分不足以决定**谁该进默认池**——真正的约束是额度模型：有没有免费量、有多少、用超了怎么算。按这个口径分五档（配置并发池时按这档选，能避免整池并发时额度翻倍）：

| 档位 | 引擎 | 超出后 |
|---|---|---|
| ① 无限免 key | `ddg` / `ddg-lite` / `bing` / `searxng` / `anysearch` | — |
| ② 匿名额度（不配 key 也能跑） | `exa` / `tavily` / `keenable` / `firecrawl` / `parallel` / `you`（每天 100 次） | 配 key 提额 |
| ③ 免费额度（需 key） | `zhihu_global` / `zhihu_site`（每日 5,000 次试用）、`doubao`（每月 500 次）、`baidu`（每日 50 次）、`aliyun`（新用户 200 次包） | 按量后付费 |
| ④ 付费升级（需 key 才有产出） | `serpbase`（注册送 100 次）/ `serply`（30 天 2,500 次）/ `perplexity` / `deepseek-official` / `deepseek-tools` / `kimi` | 按量 / 按次 |
| ⑤ 按次计费（模型内置，显式-only） | `openai` / `gemini` / `claude` | 按 token + 每次搜索 |

选默认池的经验：**① 打底 + ③ 打主力**；② 可以进但要知道它在烧匿名额度；④ 只在你确实需要该源时显式选用；⑤ 永不入池。完整的逐引擎额度事实与默认池提案见 [docs/engine-quota-tiers.md](./docs/engine-quota-tiers.md)。

#### 为什么免费引擎不需要 key？

- **AnySearch**：其 `v1/search` REST 接口提供匿名的公共搜索额度，无需注册或 API key。额度有限流（适合日常搜索），但作为免费引擎之一，与其他免费引擎互相回退，体验稳定。
- **Exa**：公开 MCP 端点（`mcp.exa.ai/mcp`）支持匿名调用，不配 key 也能用；配置 `EXA_API_KEY` 后可获得更高额度。
- **Tavily**：通过 `x-tavily-access-mode: keyless` 头走 keyless 匿名额度，不配 key 即可用；配置 `TAVILY_API_KEY` 后走账号档，额度更高、结果质量更稳定。
- **Keenable**：无 key 时走其公开 MCP 端点（`api.keenable.ai/mcp`）匿名调用；配置 `KEENABLE_API_KEY` 后走 REST API（`api.keenable.ai/v1/search`），额度更高、按组织限流。
- **Firecrawl**：其 `/v2/search` 端点**无需 key** 即可使用（官方文档明确说明，有匿名限流）；配置 `FIRECRAWL_API_KEY` 后可提高限额。支持 `tbs` 时间过滤（`qdr:h/d/w/m/y` 与自定义日期区间）。
- **You.com**：无 key 时走官方免 key 档（`api.you.com/v1/agents/search`），每天 100 次免费搜索，无需注册；配置 `YDC_API_KEY`（旧名 `YOUCOM_API_KEY` 继续兼容）后走官方 Search API（`ydc-index.io/v1/search`），额度更高。

### 安装

```sh
git clone https://github.com/DDDMUC/dsh-free-search.git
dsh plugin --profile web add /path/to/dsh-free-search
```

然后重启：

```sh
dsh web
```

#### 接管行为与验证

插件加载后**自动接管搜索**：

- `web.searchProvider` 未设置，或仍是 DSH 出厂默认的官方搜索 `deepseek-official` 时，自动切换为本插件的 provider（id 固定为 `ddg`）；
- 如果（你或别的插件）已显式选择其他 provider，本插件不抢占，只在启动日志输出 WARN 与切换用的 YAML。

**接管会写进 profile（DSH 0.2.x）**：从 `0.2.0-rc.2` 起 provider 选择存放在 config 的 volatile ref 里，只能经 `settings.mutate("web", …)` 写入，落盘结果就是 `profiles/<profile>/cordis.patch.yml` 多出：

```yaml
- id: web
  config:
    searchProvider: ddg
    fetchProvider: fs-quality-fetch
```

所以**停用或卸载本插件之前，请先删掉 `- id: web` 这两行**（或整行删掉让 DSH 回到出厂默认）。否则配置仍指向 `ddg` 而没有任何东西注册它，每次搜索都会失败：

```
Error: configured web provider "ddg" is not registered
```

更早的 DSH（0.1.x）由 patch 静态覆盖 config，不需要也更不该手写这段，这里不再赘述。

#### DSH 的「DeepSeek 搜索 API」开关

DSH 0.2.1 设置 → 网页搜索 → **DeepSeek 搜索 API** 开关会和本插件互相影响，行为如下：

| 操作 | 结果 |
|---|---|
| 打开开关 | `web.searchProvider` 写成 `deepseek-search-api`（属于「显式选择其他 provider」），**本插件主动让路**，搜索走官方直连 API；抓取同时变成 `deepseek-fetch-api` |
| 关闭开关 | DSH 会把整行 `- id: web` 删掉，provider 回到出厂默认 `deepseek-official` —— 这是**模型搜索**（一次完整 aux 请求，实测 ~12s、按 token 计费），不是免费引擎 |
| 关闭后 | **0.9.8 起**：插件检测到 `deepseek-official` 会在运行时补一次接管（日志 `DSH's search switch put the web providers back to the official defaults — re-took …`），通常几秒内恢复免费链路；若没恢复，完整重启 DSH |

想换引擎请用 `/free-search-engine` 或本插件设置页，**不要动那个开关**。打开开关再关掉，官方直连会退回模型搜索，直到插件重新接管或重启。

> 如果你在 0.1.x 时代按旧文档手写过 `- id: web`，现在可以删掉：0.2.x 由运行时接管写入。手写时注意 `fetchProvider` 应该是 `fs-quality-fetch`（本插件注册的抓取 provider），不是 `http`。

- `searchProvider: ddg` —— 本插件的 **provider id（固定值）**，不是"使用 DuckDuckGo 引擎"；用哪个引擎由设置页的 `provider` 字段决定（`bing`/`baidu`/`auto`/…）。
- `fetchProvider: fs-quality-fetch` —— 本插件的抓取 provider（直接 → exa contents → firecrawl → crawl4ai）。
- 想改用官方搜索：**先删掉 `- id: web` 的两行，再在插件管理器里停用本插件**。

#### 姊妹插件：dsh-preset-workbench（预设工作台）

同作者的**姊妹插件**：在设置页里可视化创建/编辑 Agent 预设——分段提示词、15 项能力开关、内置「鲸鱼娘 / 梁神模式」模板，不用手写 YAML。两者搭配：**free-search 解决"AI 联网搜索"、preset-workbench 解决"AI 人设能力编排"**，都是纯免费、开箱即用。

- 仓库：<https://github.com/DDDMUC/dsh-preset-workbench>
- 安装：`dsh plugin --profile web add github:DDDMUC/dsh-preset-workbench`
- 用法：设置 → 预设工作台

如果你觉得 preset-workbench 也有用，同样欢迎给它的仓库点个 ⭐。🙏

#### 依赖说明

插件对 `@deepseek-ai/dsh-settings` 和 `@deepseek-ai/dsh-tools` 使用 `peerDependencies`，这是刻意的：DSH 运行时必须使用安装树中的唯一实例。请通过 `dsh plugin --profile <profile> add ...` 安装插件，不要把 DSH 核心包复制进 profile 的本地 `node_modules`；重复副本会导致工具调度器失效。

### 使用

#### 网页设置（推荐）

安装后打开配置页（DSH 0.1.7-rc.1+）：

- 左侧 **插件** 页 → **已安装** 分组 → `free-search` → 点击组件行 `web-search-free`（行内"配置"入口）

配置页提供：

- **Search engine**：下拉框切换引擎，保存即生效
- **API keys**：为 Exa / Tavily / Keenable / Firecrawl / Parallel / Perplexity / DeepSeek / SerpBase / Serply / You.com 填写 key（密码框，保存后只显示"已配置"；Exa / Tavily / Keenable / Firecrawl / Parallel / You.com 不填也可免 key 使用）
  - **推荐**：付费引擎 key 建议写入 harness 凭据中心 `~/.dsh/.credentials.yaml`（如 `DEEPSEEK_API_KEY: sk-...`，与官方 LLM provider 一致，一处管理所有 key）。插件读取优先级：凭据中心 > 设置页 > 环境变量，设置页填的 key 仅作为遗留兼容。
- **Test engine**：直测当前引擎可用性（不走回退链，付费引擎无 key 会明确报错）
- **Use Bing default**：把当前搜索引擎切回稳定的免费 Bing；`Discard` 只撤销尚未保存的编辑
- **Platform search**：勾选启用 GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / 维基百科 / npm / YouTube / Vimeo / 掘金 / 豆瓣 / Qiita 平台搜索（`platform_search` 工具按此过滤）
- **EN / 中文**：切换界面语言（默认中文）

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

#### 聊天框切换引擎（/free-search-engine）

不用进设置页也能切换引擎：在聊天框输入 `/free-search-engine`，**弹出引擎选择窗口**（和 `/model` 选模型一样的交互），点选即切换，当前引擎会标记出来。等效于设置页切换 + 保存，且界面语言跟随设置页（中文/英文）。

命令只改首选引擎配置，搜索仍走 `web_search` + 统一回退链：即使首选引擎挂了也会自动换其他引擎，永不直接失败。系统提示词同步刷新。

#### 引擎开关、回退优先级与 Multi 模式

设置页有这些块（都会保存进条目 config）：

- **全局启用的搜索引擎**：取消勾选后，该引擎会从普通 `web_search` 回退链、Auto 智能路由、`advanced_search`、`multi_search` 和引擎测试中**全局排除**；至少要保留一个引擎。
- **全局回退优先级**：用 ↑↓ 调整先后顺序。首选引擎仍先尝试；Auto 保留"语言/时间"路由规则，但自定义后同一分组内及后续回退按此顺序。被禁用的引擎保留在列表里（标记「已禁用」）但不执行；「恢复默认顺序」一键还原。
- **中文查询池（zhPool）/ 英文查询池（enPool）**：Auto 路由的起始组，也是 Multi 模式的并发池。按查询语言自动二选一（检测到中日韩文字走中文池，其余走英文池）；两池都可用 ↑↓ 排序、下拉添加引擎、「−」移除（**每池最低 2 个引擎，无上限**）。默认中文池 `bing / baidu / aliyun / anysearch`，默认英文池 `bing / exa / tavily`；禁用/冷却/缺 key 的引擎运行时自动跳过。
- **搜索引擎下拉里的 `Multi Search`**：选中后 `web_search` 会并发查询**查询语言对应池的全部**已启用引擎（不再是前 3 个），URL 去重合并、跨源命中的结果排前面。注意整池并发会成倍消耗额度（池里含按额度计费引擎时尤其注意）；Multi 失败时会自动退回普通单引擎回退链并在结果里注明。

#### 失败分类与引擎冷却（Failure-aware fallback）

回退链不再把所有失败一视同仁，而是先给失败分类（issue #36）：

- **`quota`（额度/预算耗尽，HTTP 402 / `NO_MORE_CREDITS` / SerpBase 免费额度用尽）**：立即切换，并把该引擎**在本进程内冷却**——后续搜索不再尝试它，避免反复撞墙；
- **`auth`（401/403、key 无效或未配置）**：同上，冷却到本会话结束（改好 key 重载插件即恢复）；
- **`bot-wall`（如 DDG 反爬挑战）**：冷却一小段（默认 60s）后再自动放回链中；
- **`transient`（超时 / 5xx / 网络 / 429 限流）**：**同一引擎重试一次**再回退，避免一次抖动就丢掉好引擎；
- **`invalid-response`（解析失败 / 结构变化 / 返回 0 结果）**：照常回退，但归类为插件侧问题，不冷却引擎。

回退结果的 `Note:` 现在会给出具体类别，例如 `Note: exa is out of quota, using doubao.`、`Note: perplexity is misconfigured (API key rejected), using doubao.`、`Note: bing failed (transient), using doubao.`。`free_search_test` 也会为每个失败引擎附上类别（`failureClass`）。

冷却只作用于本进程（重载插件或重启即清空），且**对配置的首选引擎同样适用**：若它正在冷却，本轮会跳过并回退，结果里注明 `is cooling down`；冷却中的引擎一旦成功即自动解冻。

`fallbackOn` 控制哪些失败类别**允许**触发回退：默认勾选全部六类，即当前的「搜索永不直接失败」；取消某类后，遇到该类失败会**停下并把该引擎的错误报出**，不再换引擎（例如去掉 `invalid-response`：首选引擎返回空/解析失败时直接报错，而不是静默退回低质引擎）。设为空数组 `[]` 则任何失败都立即中止。注意**缺 key、被禁用、不支持时间过滤不算失败**，无论怎样都照常换引擎。设置页有对应勾选框，也可在 config 写 `fallbackOn: [quota, auth, bot-wall, transient, invalid-response, unknown]`。

#### 安全搜索（safeSearch）

`safeSearch` 控制内置来源是否额外套一层安全过滤，默认 `off`（不加参数，保持引擎自身默认行为）：

| 值 | 含义 |
|---|---|
| `off`（默认） | 不加过滤参数，保持引擎默认行为 |
| `moderate` | 过滤成人内容 |
| `strict` | 最严格过滤 |

作用于 **Bing**（`adlt`）、**DuckDuckGo HTML**（`adlt`）、**DuckDuckGo Lite**（`adlt`）；其它引擎没有对应参数，不受影响。设置页有下拉框，也可直接在 config 里写 `safeSearch: moderate`。

#### fetch provider 接管（与其它 fetch 插件冲突）

插件运行时会尝试接管 `web.fetchProvider`：

- 未设置、或仍是出厂默认 `http` → 接管为 `fs-quality-fetch`（直连 → exa contents → firecrawl → crawl4ai）；
- 已被**显式指向其它 provider**（例如 `playwright`）→ **不抢占**，只记一条日志（进程内只打一次）。

如果你同时装了也会注册 fetch provider 的插件（例如 `dsh-web-fetch-playwright`、`dsh-chatgpt-subscription`），**请在 profile 的 `cordis.patch.yml` 里明确让一方退出**：

```yaml
- id: web
  config:
    fetchProvider: playwright   # 用别人的 fetch；本插件只接管 search
```

否则启动阶段可能出现「互相写 `web` config → web 服务重建 → 插件重复 apply」的循环（见 issue #82）。

如果你**特意** pin 了 `fetchProvider: http`（只想要内置抓取），把 `fetchProviderTakeover` 设为 `false` 即可：本插件不再把 `http` 当成「出厂默认」去接管，但仍会在完全未设置时补上。

`searchProvider` 的规则相同：未设置或仍是 `deepseek-official` 时接管，显式指定其它 provider 时不抢占。

#### 配置文件

DSH 0.1.7-rc.1 起，配置跟随 profile 的插件条目保存：设置页与 `/free-search-engine` 都会写入当前 profile 的 `cordis.patch.yml` 中 `web-search-free`（`dsh-free-search`）条目的 `config`。

旧版 `~/.dsh/settings.yaml` 的 `free-search:` 段**不会被 DSH 核心自动导入**（核心的 `importLegacyDocument` 只为 `ui-developer-tools` / `ui-onboarding` / `shell` 三个段提供了映射），原文件在导入其它段后会被改名为 `settings.yaml.imported`，该段的值只留在那里。插件会在启动时检测 `settings.yaml.imported`（或仍存在的 `settings.yaml`）中的 `free-search:` 段，把可识别的字段**一次性补种**进当前 profile 的条目 `config`（写一次后不再重复，可在启动日志看到 `free-search: migrated N field(s)…`）。如果你想手动处理，也可以照着 `settings.yaml.imported` 里的值在插件页行配置中填一遍。

```yaml
# profiles/<profile>/cordis.patch.yml 中该条目的 config：
provider: bing              # ddg / ddg-lite / bing / searxng / anysearch / exa / tavily / keenable / firecrawl / parallel / perplexity / serpbase / serply / deepseek-official / deepseek-tools / you / baidu / kimi / aliyun / doubao / zhihu_global / zhihu_site / openai / gemini / claude / auto / multi
fallbackOn: [quota, auth, bot-wall, transient, invalid-response, unknown]   # 允许触发回退的失败类别；[] = 任何失败都立即中止（默认全部）
lang: zh                    # 搜索语言池/本地化（zh / en / ru …，不再被设置页强行改写）
#   lang 决定：Bing 的 mkt/Accept-Language、Wikipedia 子域（ja → ja.wikipedia.org）、地理编码语言；
#   我们自己渲染的文案只有中文/英文两套，其它语言（ja/ru/de…）一律走英文，避免回答前先塞一段中文（#92）；
#   weather 例外，另有日文（ja 得到日文天气，ru/de… 仍走英文）。
#   web_fetch（fs-quality-fetch）的 Accept-Language 同样跟随 lang，不再固定中文（#92）。
uiLang: zh                  # 设置页界面语言（zh / en）；留空则跟随 lang
bingMarket: zh-CN           # Bing 市场；留空 = 自动（不发送 mkt）
fetchProviderTakeover: true # false = 保留你显式 pin 的 fetchProvider: http
region: cn-zh               # DuckDuckGo 区域（可选）
searxngInstances:           # 自定义 SearXNG 实例（可选）
  - https://your-instance.example
searxngBearerToken: ...      # 可选：发送 Authorization: Bearer <token>（设置页「SearXNG Bearer Token」同款）
degoogInstances:            # 自建 degoog 实例（可选，例如 https://search.example.com）
  - https://search.example.com
degoogApiKey: ...           # 可选：实例开启 API Key 时使用的 Bearer 密钥
safeSearch: off              # 安全搜索：off（默认）/ moderate / strict，作用于 bing / ddg / ddg-lite
blockedDomains:              # 域名黑名单（可选）：命中的域名不会进入结果
  - spam-example.com
multiMaxEngines: 0           # multi 并发上限（0 = 不限，跑完整语言池）；设置页有 Fast/Balanced/Deep 档位
multiMinSources: 1           # multi 目标成功源数（只用于触发补跑，不是硬下限）
exaApiKey: ...              # 或通过设置页填写
tavilyApiKey: ...           # 或通过设置页填写
keenableApiKey: ...         # 或通过设置页填写
firecrawlApiKey: ...        # 或通过设置页填写
parallelApiKey: ...         # 或通过设置页填写
perplexityApiKey: ...
serpbaseApiKey: ...         # 或通过设置页填写
serplyApiKey: ...           # 或通过设置页填写
deepseekApiKey: ...
```

#### 让 agent 测试所有引擎

对 agent 说"测试一下所有搜索引擎"，它会调用 `free_search_test` 工具，逐个测试并报告：

```
Search engine test:
- ddg: FAIL - DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary) - Bing works
- bing: OK (2 results, e.g. "DeepSeek Harness developer preview...")
- exa: FAIL - EXA_API_KEY not configured
```

#### 时间过滤（advanced_search）

让 agent 搜"最近一周的新闻"、"这个月的发布"、"最近 3 天的消息"、"7 月以来的更新"，它会调用 `advanced_search` 工具，带 `timeRange` 参数。该工具同样走统一回退链，且可显式指定 `engine`，返回结构同 `web_search`。

**timeRange 支持三种形式：**

| 形式 | 示例 | 含义 |
|---|---|---|
| 固定档 | `day` / `week` / `month` / `year` | 分别 = 1 / 7 / 30 / 365 天 |
| 自定义相对值 | `12h`、`3d`、`2mo`、`1y` | 最近 12 小时 / 3 天 / 2 个月 / 1 年 |
| 绝对日期 | `2026-07-01` | 该日期（含）之后发布的结果 |

**各引擎对 timeRange 的处理逻辑：**

| 引擎 | 参数 | 是否精确 | 说明 |
|---|---|---|---|
| Exa | `startPublishedDate` | ✅ 精确 | 自定义天数转成 ISO 日期（N 天前），绝对日期原样传入 |
| Keenable | `published_after` | ✅ 精确 | 相对值原样传（`12h/3d/2mo/1y`），绝对日期原样传 |
| Tavily | `time_range` | ⚠️ 近似 | 只认固定档，自定义天数自动映射到最近似档位 |
| Firecrawl | `tbs` | ⚠️ 近似 | 固定档映射到 `qdr:d/w/m/y`；绝对日期用 `cdr:1,cd_min:M/D/YYYY`（精确） |
| Parallel | `source_policy.after_date`（有 key 时精确）；无 key 走 MCP，无日期参数，改为把窗口写进 objective 作为新鲜度提示（软过滤） | ✅ 精确 / ⚠️ 软过滤 | 自定义天数转成 ISO 日期（N 天前），绝对日期原样传入 |
| SearXNG | `time_range` | ⚠️ 近似 | 同上 |
| DuckDuckGo / Lite | `df` | ⚠️ 近似 | 同上 |
| Bing / AnySearch | — | ❌ 忽略 | 无对应参数 |
| DeepSeek 原生搜索（`deepseek-tools`） | query 语法 `after:` | ✅ 精确 | 端点无独立时间字段，改为把 `after:YYYY-MM-DD` 拼进 query；相对天数按 N 天前折算 |

**"最近似档位"映射规则**：`≤2 天 → day`，`≤14 天 → week`，`≤90 天 → month`，否则 `year`。例如 `3d` 在 Tavily 上按 `day` 处理，`2mo` 按 `month` 处理。

**引擎链优先级**：当带 timeRange 搜索时，支持时间过滤的引擎（tavily / exa / keenable / firecrawl / parallel / searxng / ddg / ddg-lite / deepseek-tools）会排到引擎链前面，确保过滤真正生效——即使首选引擎是 bing（不支持过滤），也会先尝试支持过滤的引擎。

示例对话：*"帮我搜最近 3 天关于 DSH 的新闻"* → agent 调用 `advanced_search`，`timeRange: "3d"`。

#### 多源并发合并搜索（multi_search）

当需要对重要问题做**多源交叉验证**、避免单一引擎偏差或单源死锁时，可以让 agent 调用 `multi_search` 工具：

- **并发请求**：默认按查询语言并发**对应语言池的全部**引擎（不再是前 3 个；或显式传入 `engines` 列表），各引擎独立解析 API Key 与容错（缺 key 引擎自动跳过，不阻断其他引擎）。
- **三档强度**（设置页单选按钮，选完即写入配置）：

  | 档位 | 并发上限 | 目标成功源数 |
  |---|---|---|
  | `Fast · 1/1` | 1 | 1 |
  | `Balanced · 3/1` | 3 | 1 |
  | `Deep · 6/2` | 6 | 2 |

  手填下面的数字即为「自定义」，不会有档位按钮处于选中态。
- **并发上限**（`multiMaxEngines`，默认 `0` = **不限**，跑完整语言池）：这是**天花板**，不是下限——实际并发数取「上限」与「凭据合格引擎数」的较小值；凭据判定在截断**之前**完成，缺 key 的引擎不会白占名额（所以 3 个可用引擎 + 上限 6 仍然全部跑）。
- **目标成功源数**（`multiMinSources`，默认 `1`）：**不是硬下限**。只用来触发补跑——已返回源数不足时，按域名轮转顺序**串行补跑**剩余的合格引擎；补跑跑完或时间到就返回已有结果（拿不满不报错）。
- **总预算 30 秒**（`SEARCH_BUDGET_MS`）：并发扇出 + 全部补跑共享同一个 deadline，到点即停并返回**已经拿到的结果**，不会因为某个慢引擎把整次搜索拖死。
- **去重与合并**：按规范化 URL 去重（去掉结尾斜杠与已审计的 tracking 参数），多引擎共同命中的条目优先置顶并附带 `seenIn` 命中来源清单（如 `[seen in: bing, exa]`）；**同站判定用 eTLD+1**——`a.example.co.uk` 与 `b.example.co.uk` 视为同一站点，域外多样性轮转在**站点**粒度上做，不会被多个子域刷屏。
- **不可信边界与清洗**：严格遵守 `<untrusted-web-content>` 数据边界，正文 snippet 统一清洗。
- ⚠️ 注：多源并发会消耗更多 API 配额，建议在需要多角度核验时按需使用。

#### 输出契约（meta.uncertainty）

`advanced_search` 与 `multi_search` 的输出多了一个可选字段 `meta.uncertainty`，用来告诉 agent「这次结果有多可信」，不影响原有 `provider` / `content` / `sources`：

```json
{ "provider": "multi", "sources": [ ... ],
  "meta": { "uncertainty": { "level": "medium", "notes": ["只有 2 个来源"] } } }
```

- `level`：`high` / `medium` / `low`，按来源数量、站点是否同一家、带时间过滤却无发布时间、是否包含聚合站、是否有引擎失败等启发式判定；
- `notes`：具体原因（中文）；`high` 时通常为空；
- 渲染文本在非 `high` 时会追加一行 `Confidence: …`。

这是**小步版**：只新增字段，旧解析不受影响。
#### 抓取网页内容（web_fetch）

搜索到 URL 后，可以让 agent **读取网页全文**（如"打开第一个链接看看内容"）。`web_fetch` 工具已启用（官方 `dsh-web-fetch-http` provider）：

- 自动跟随重定向、解码正文（HTML 转文本）
- 支持超时和大小限制
- ⚠️ 注意：`web_fetch` 无 SSRF 防护，agent 理论上可访问内网地址——按需使用

#### 平台搜索（platform_search）

让 agent 搜特定平台，如"在 GitHub 上搜 deepseek harness"、"看看 B站有什么相关视频"、"V2EX 上关于 dsh 的讨论"。`platform_search` 工具支持：

| 平台 | 用途 |
|---|---|
| `github` | GitHub 仓库搜索（API，免费无 key） |
| `v2ex` | V2EX 热门/相关主题 |
| `bilibili` | B站视频/内容搜索（公开接口） |
| `reddit` | Reddit 帖子/讨论搜索（公开 JSON API；部分网络环境可能被 Reddit 反爬拦截） |
| `hn` | Hacker News 技术社区讨论（Algolia 官方 API） |
| `stackoverflow` | Stack Overflow 技术问答（Stack Exchange 官方公开 API） |
| `wikipedia` | 维基百科词条（中文环境用 zh.wikipedia.org，`lang: en` 时切换 en.wikipedia.org） |
| `npm` | npm 包搜索（registry 官方 API） |
| `youtube` | YouTube 视频搜索（抓 results 页 `ytInitialData`，免 key） |
| `vimeo` | Vimeo 视频搜索（抓搜索页内嵌数据；抓不到时退回网页搜索 `site:vimeo.com`，免 key） |

公开 API 或免 key 抓取，零外部依赖、无需任何 key。`youtube` / `vimeo` 需要先在设置页「平台搜索」里勾选启用。

#### 视频搜索（video_search）

让 agent 找视频："找几个关于 X 的视频"、"有没有 Y 的教学视频"。`video_search` 跨站搜索：

| 源 | 说明 |
|---|---|
| `bing` | Bing Videos（抓 `bing.com/videos/search` 的 `vrhm` 元数据，免 key） |
| `ddg` | DuckDuckGo Videos（vqd + `v.js`，免 key） |

默认两个源都试、失败互相回退，返回 `url / title / snippet`（来源站点、时长等）。**免 key 抓取，对方改版可能失效**；要按站点搜（YouTube / Vimeo / B站）请用 `platform_search`。

#### 一次调用完成研究（research）

`research` 让 agent 一次调用拿到带出处的证据包：多引擎并发搜索 → 候选重排 → 分层抓取正文 → 段落选窗 → Markdown 简报。适合"需要多源核验的问题"，可替代 agent 自己串联 `web_search` + `web_fetch`。

- **参数**：`question`（问题原文）、`depth`（抓取正文的篇数，1–5，默认 3；自动取整并夹到该区间）。
- **输出**：`sources` 检索结果、`documents` 抓到的正文（每条含 `kind`、`text_origin`、`tier`、`published`、`fetched_at`、`engine_hits` 等字段）、`notes` 执行注记、`estimatedTokens` 粗估 token。
- **共享预算**：全阶段共用 90 秒截止（`DEADLINE_MS`）与 12 次搜索调用上限（`SEARCH_REQUESTS_MAX`）；到点取消在途请求、排队任务不再启动，并返回已拿到的部分结果，在 `notes` 里记 `deadline_hit` 或 `budget_exhausted`。
- **降级**：重排、嵌入、决策模型任一失败即静默回退规则路径，不影响返回结果；抓取失败时退化为只用检索摘要（`snippets only`）。
- **不可信边界**：返回的简报包在 `<untrusted-web-content>` 内。

无 key 时的降级行为（**基本路径仍可用，不会因缺 key 中断**）：

| 未配置的 key | 影响 |
|---|---|
| `SILICONFLOW_RERANK_API_KEY` | 跳过候选重排与段落模型打分，改用轻筛排序；抓取前语义簇标记也跳过。`notes` 记录降级路径 |
| `DECISION_MODEL_API_KEY` / `DECISION_MODEL_URL` | 决策模型整体关闭（`decide()` 直接返回 null），意图判定、充分性闸门、改写挑选全部走规则版。两者需**同时**配置才生效 |
| `EXA_API_KEY` / `FIRECRAWL_API_KEY` / `CRAWL4AI_API_KEY` | 分层抓取自动跳过对应层，其余层照常 |

> 决策模型端点默认**关闭**（`DECISION_MODEL_URL` 默认为空串）：不配置就不会外呼第三方端点。需要时自行指定 `DECISION_MODEL_URL`。

#### 检索正文缓存（cache_search）

`cache_search` 全文检索 `research` 抓过的正文，用来"回头看之前查到什么"，不必重新抓取。

- **参数**：`query`（检索词）、`limit`（返回条数上限，默认 8，最大 20）。
- **返回**：`url` / `title` / `excerpt` / `fetched_at`，同样包在 `<untrusted-web-content>` 内。
- **存储位置与清理**：默认写入 `~/.cache/dsh-free-search/research.db`，可用环境变量 `RESEARCH_CACHE_DIR` 换成别的目录（指向备份盘、或想随项目走时用）。**清理方式**：删除该目录即可，没有后台任务残留、没有注册表项。缓存 7 天后过期，查询时惰性清理，过期行不占检索结果。
- **`node:sqlite` 不可用时降级**：无法加载 `node:sqlite` 时缓存整体禁用（no-op）——`research` 正常运行，`cache_search` 返回空数组，插件不会因此报错。`node:sqlite` 自 v22.13.0 / v23.4.0 起免 flag；22.5–22.12 需以 `--experimental-sqlite` 启动，否则同样走 no-op。

### 本地引擎切换工具（tools/）

`tools/` 目录附带了一个本地切换小工具（零依赖）：

- **`启动搜索引擎切换器.cmd`**（Windows）——双击启动本地 Node 服务（`http://127.0.0.1:4789`）并自动打开浏览器选择页面
- **`switch-engine.html`** —— 选择页面：显示当前引擎，点选新引擎，一键写入配置
- **`server.mjs`** —— 本地服务，负责读写 `~/.dsh/profiles/web/cordis.patch.yml`
- **`switch-engine.ps1`** —— 无界面命令行版：`powershell -File tools/switch-engine.ps1 -Engine bing`

切换后重启 `dsh web` 生效。

#### 离线自检断言（tools/）

仓库自带 **27 个**零依赖断言脚本（合计 **592 项**），**不需要 API key、不联网、不需要测试框架**，Node ≥ 20 即可跑：

| 脚本 | 覆盖 | 运行（项数） |
|---|---|---|
| `assert-engines.mjs` | 引擎清单 / 免费引擎口径 / 语言分池路由 / 池配置字段 / 知乎 URL 剥 utm / `deepseek-tools` 接线与 snippetCap 放宽 | `node tools/assert-engines.mjs`（41） |
| `assert-blocked-domains.mjs` | 域名黑名单：解析、匹配、收口，且前后端清洗同口径 | `node tools/assert-blocked-domains.mjs`（69） |
| `assert-multi-policy.mjs` | multi 执行策略：并发上限是天花板 / 目标成功源非硬下限 / 凭据资格在上限之前分流 / **Fast·Balanced·Deep 档位** | `node tools/assert-multi-policy.mjs`（146） |
| `assert-result-ranking.mjs` | 合并排序：**eTLD+1 同域判定** / 域名轮转 / `seenIn` 降为末位 / 时效仅带时间过滤时生效 | `node tools/assert-result-ranking.mjs`（31） |
| `assert-url-norm.mjs` | URL 规范化：只剔已审计的 tracking 参数，保留可能区分资源的参数 | `node tools/assert-url-norm.mjs`（72） |
| `assert-prompt-contract.mjs` | 系统提示词契约：**检索≠抓取**、不可信边界、模型内置搜索只在显式选中时运行 | `node tools/assert-prompt-contract.mjs`（9） |
| `assert-research-degradation.mjs` | research 无 key 全降级、`node:sqlite` no-op、90s 预算隔离、缓存目录可配置、`budget.exhausted` 契约名 | `node tools/assert-research-degradation.mjs`（19） |
| `assert-research-call-wrappers.mjs` | research 四个 `call*` 包装层的替身/底层透传（#75 回归） | `node tools/assert-research-call-wrappers.mjs`（23） |
| `assert-fetch-chain.mjs` | `fs-quality-fetch` 四层链序、任一层命中即停、exa 失败静默降级 firecrawl、全层失败聚合报错 | `node tools/assert-fetch-chain.mjs`（8） |
| `assert-single-fetch-layer.mjs` | 抓取层全库只有一份实现、依赖单向、替身键不串层 | `node tools/assert-single-fetch-layer.mjs`（22） |
| `assert-vertical.mjs` | `domain_search` 41 引擎注册表、每引擎 desc、未知引擎报错、不依赖 research | `node tools/assert-vertical.mjs`（8） |
| `assert-free-search-test-schema.mjs` | `free_search_test` 输出 schema 与真实产出一致（含 auto/multi 虚拟模式） | `node tools/assert-free-search-test-schema.mjs`（8） |
| `assert-weather-contract.mjs` | `weather` 工具输出 schema 契约（缺字段裁剪、英文输出、空 geocode 抛错） | `node tools/assert-weather-contract.mjs`（11） |
| `assert-killtree-win32.mjs` | Windows 子进程树终止（#74）：不再依赖 `taskkill` | `node tools/assert-killtree-win32.mjs`（8） |
| `assert-killtree-portable.mjs` | 跨平台 `killTree` 便携版契约 | `node tools/assert-killtree-portable.mjs`（5） |
| `assert-parallel-mcp.mjs` | Parallel MCP 引擎：25 s 超时/调用方取消覆盖**响应体读取**、共享 SSE 解析器（通知/多行帧）、6 类错误路径、REST 精确时间过滤 | `node tools/assert-parallel-mcp.mjs`（15） |
| `assert-output-language.mjs` | 语言分支（#92）：`searchLanguage` 支持 zh/en/ja/ru/de/es/fr/ko 其余回退 en、`outputLanguage` 只输出 zh/en、天气文案 zh/en/ja（其它回退英文，含 WMO 描述与正文）、置信度说明随语言、失败备注随语言 | `node tools/assert-output-language.mjs`（10） |
| `assert-uncertainty.mjs` | 输出契约：0/1 源为 low、2 源与同站为 medium、3 个不同域为 high、时间过滤无日期、失败备注、聚合站提示 | `node tools/assert-uncertainty.mjs`（8） |
| `assert-youcom.mjs` | You.com 免 key 档（#90）：两档 URL 与请求头、无 key 不发 `X-API-Key`、`YDC_API_KEY` 别名、429/401/402/5xx 分类 | `node tools/assert-youcom.mjs`（23） |
| `assert-tool-schema-size.mjs` | 工具 schema 体积（#94）：共享引擎 id 常量、`domain_search` 不内嵌逐引擎句子、三处合计 < 1.6k 字符 | `node tools/assert-tool-schema-size.mjs`（5） |
| `assert-degoog.mjs` | degoog 自建实例（#85）：`/api/search` URL 规范化、查询编码、`time`/`lang` 参数、注册表位置、无需凭据 | `node tools/assert-degoog.mjs`（7） |
| `assert-multikey.mjs` | 多 key 字段：单 key 不变、逗号/分号/换行分隔、空白项丢弃、空输入为空数组 | `node tools/assert-multikey.mjs`（3） |
| `assert-firecrawl-keyless.mjs` | Firecrawl keyless 出口判定：403 + VPN/proxy 文案才算拒绝、普通 403 与 401/429/500 不算、冷却初始未触发 | `node tools/assert-firecrawl-keyless.mjs`（5） |
| `assert-fetch-charset.mjs` | 抓取编码（#88）：`charset=gbk` / `gb2312` 按声明解码、无声明时嗅探 `<meta charset>` 与 http-equiv 形式、默认 UTF-8、未知 label 兜底 UTF-8 不抛错 | `node tools/assert-fetch-charset.mjs`（6） |
| `assert-fetch-abort.mjs` | 抓取中断（#87）：压缩响应中途断连必须 reject（不再永久 pending）、明文断连同样 reject、abort 能打断停滞的 gzip 流、complete 响应与重定向仍正常 | `node tools/assert-fetch-abort.mjs`（6） |
| `assert-bridge-access.mjs` | 桥接 Host 围栏（#84）：loopback 放行、remote peer 打 loopback Host 拒绝、`--trusted-host`（无端口匹配任意端口 / 带端口精确匹配）、`--public-url`、绑定地址、跨站与异源拒绝 | `node tools/assert-bridge-access.mjs`（11） |
| `assert-provider-takeover.mjs` | provider 接管：旧属性 API 与 rc.2 的 `config.*` ref 两套兼容、`settings.mutate(web)` 单批写入、显式指定的 provider 不被抢占、`fetchProviderTakeover: false` 时保留显式 `http`、describe 噪声不误报、嵌套 config 变化与 web 重建分别成行、关闭 DSH 搜索开关后重新接管且不抢 `deepseek-search-api`、apply 重入/重复注册不再中断、重复日志去重 | `node tools/assert-provider-takeover.mjs`（16） |

任何一个失败会以非 0 退出码结束并列出失败项；把某个旧版本文件路径作为参数传进去，可以看到修复前必红（用来证明断言不是空转）。改动发布相关逻辑后建议先跑一遍再发版。

> 配置卡片挂在左侧「插件」页的 `plugins.row.config` 行配置插槽（dsh 自带），配置读写走插件自建 bridge，**不依赖 dsh-web-ui**，插件可独立使用。

### 代理说明（国内用户）

DuckDuckGo 等引擎可能需要代理才能访问，而 Node.js 的 `fetch` 默认不走系统代理。需要给 dsh 进程设置（Node 24+）：

```sh
export NODE_USE_ENV_PROXY=1
export HTTPS_PROXY=http://127.0.0.1:7897   # 你的代理地址
export HTTP_PROXY=http://127.0.0.1:7897
```

Windows 用户：桌面快捷方式已内置此配置（`set NODE_USE_ENV_PROXY=1&& set HTTPS_PROXY=...`）。

### 工作原理

- `lib/index.js`：host 端。实现 `WebSearchProvider`（`id` / `available()` / `search()`），统一引擎路由 + 自动回退（付费引擎优先，免费兜底）；解析 `timeRange`（固定档/相对值/绝对日期）并透传给各引擎；在 `web-search-free` 条目上声明可编辑配置（`.volatile()`）并自带设置页（`plugins.row.config`）；提供 `/api/dsh-free-search-settings` 读写桥 + `raw-search` 调试接口；注册 `free_search_test`、`platform_search`、`video_search`、`advanced_search`、`multi_search` 工具；动态注入引擎清单到系统提示词（设置变更时自动刷新）。
- `lib/client.js`：浏览器端。React 配置卡片（引擎选择 + key 输入 + 连通测试 + 中英切换），挂载到左侧「插件」页的 `plugins.row.config` 行配置插槽；注册 `/free-search-engine` 弹出式切换命令（`commandUi` popupSelect，与 `/model` 同机制）。
- `cordis.patch.yml`：插件 loader 配置。

---

## English

<div align="center">
  <a href="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-free1.png">
    <img src="https://raw.githubusercontent.com/DDDMUC/dsh-free-search/master/assets/settings-free1.png" alt="Free Engine Settings (Bing)" width="820" />
  </a>
  <br>
  <sub>▲ Free engine (using Bing as an example)</sub>
</div>

### Why You Need It

dsh's default search provider relies on the official DeepSeek API key (`DEEPSEEK_API_KEY`). If you:
- Do not have (or prefer not to use) an official DeepSeek key,
- Use a gateway like opencode-go (whose OpenAI-compatible endpoint does not support the `web_search` tool),

...then the built-in search will inevitably fail, and the agent will tell you "I cannot access the internet."

This plugin provides multiple free search engines with automatic fallback, completely freeing you from relying on DeepSeek's official key.

### Features

- **Zero Cost** — Multiple free engines with no API key or registration required
- **Multi-Engine Support** — DuckDuckGo (HTML / Lite), Bing, AnySearch AI, SearXNG (meta-search with custom instances), Exa, Tavily, Keenable, Firecrawl, Parallel, Perplexity, SerpBase, Serply, DeepSeek Official, You.com, Baidu Qianfan, Kimi, Aliyun Bailian, Volcano Doubao, Zhihu web-wide/site search (`zhihu_global`/`zhihu_site`, via the Zhihu open-platform MCP), and the model-based OpenAI / Gemini / Claude searches
- **Web Settings UI** — Engine switching, API key configuration (keys masked as "configured" in the UI), and a Chinese/English toggle; the entry is the component-row config (`plugins.row.config`) on the sidebar Plugins page (DSH 0.1.7-rc.1+). Remote access (VPS, reverse proxy, custom domain) works too: the bridge reuses the host's own Host fence, so addresses declared with `--trusted-host` or `--public-url` are accepted (#84)
- **Right-hand section rail** — A floating list (Engines / Fallback / Language pools / Search behaviour / Fetch / Performance) sits in the page margin to the right of the card: it highlights the section you are in while scrolling and jumps smoothly on click. It is rendered in a portal and never narrows the card, so the body layout is unchanged; it hides itself when the margin is too tight.
- **Multi-key rotation** — Any key field (or its env var) accepts several keys separated by commas, semicolons or newlines; on 401/402/429 (bad key, quota exhausted) the same engine retries with the next key before the engine-level fallback runs
- **Popup Switch Command** — Type `/free-search-engine` in the chat: a picker opens with all engines; click one to switch (equivalent to the settings page + save)
- **Engine Testing** — `free_search_test` for the agent to check all engines in one call; the settings UI also has a "Test engine" button that tests the selected engine directly (no fallback chain; paid engines without a key report an explicit error)
- **Global engine enable/disable & fallback priority** — uncheck engines you never want (applies everywhere: web_search fallback, Auto routing, advanced_search, multi_search, engine tests) and reorder the global fallback chain with ↑↓ (one-click reset)
- **Multi mode** — pick `Multi Search` as the engine: web_search queries **every enabled engine of the query's language pool** concurrently (no longer top 3; zh/en pools editable in the settings UI, minimum 2 engines each), merges/deduplicates URLs (same-site detection via **eTLD+1**) and prioritizes cross-source hits; the settings UI offers **Fast / Balanced / Deep** presets or your own cap and target numbers; the whole run shares one **30-second budget** and returns whatever it already has when time is up (costs more quota; a failed multi run automatically falls back to the single-engine chain)
- **Unified Engine Fallback** — Any engine failure (paid or free, missing key, 401, rate limit, network error) automatically tries the next engine: the configured engine first, then other engines (exa/tavily/keenable/firecrawl/parallel/you are tried even without a key because they have built-in keyless quota), then the remaining free engines (Bing/AnySearch etc.) — with a note attached to the results naming the engine that actually served them (e.g. `Note: perplexity unavailable or failed, using exa.`). Failures are classified: quota/auth failures cool the engine down for the session, anti-bot walls back off briefly, timeout/5xx/rate-limit failures retry the same engine once, and parse errors / 0 results are reported without cooling it down (see "Failure-aware fallback" below). Search never fails outright.
- **Time Filtering** — The `advanced_search` tool supports `timeRange`: fixed tiers, custom relative values, or an absolute date (details below)
- **System Prompt Injection** — The agent is aware of the currently active engine and which engines require API keys; it is also told that all search output is **untrusted external data** and must never be executed as instructions
- **Prompt-Injection Guard (untrusted-data boundary)** — Web-derived text from the plugin's own tools (`advanced_search` / `platform_search` / `free_search_test`) is wrapped in an explicit `<untrusted-web-content>` boundary (look-alike tags inside the text are stripped to prevent early closure); the core `web_search` / `web_fetch` tools carry DSH core's own notice (`External web content follows...`); every snippet is cleaned and capped at 300 characters
- **Version + Update Check** — The settings card shows the current version (tracks PLUGIN_VERSION, bumped on release), and a "Check update" button queries the npm registry to compare against the latest release, prompting a one-click jump when a newer version exists
- **Result Caching** — Identical queries (same engine / time-filter args) hit an LRU cache (50 entries) for up to 5 minutes, protecting free engines from rate-limiting and saving paid quota; the TTL is configurable from 0-5 minutes in the settings UI (0 disables caching)
- **Domain blocklist & safe search** — `blockedDomains` keeps matching domains out of every result; `safeSearch` (`off` / `moderate` / `strict`) adds a filter layer for Bing / DuckDuckGo
- **Visual Badges** — Free engines feature a green `FREE` badge, while paid engines show an orange `API KEY` badge in the settings UI
- **Webpage Fetching (`web_fetch`)** — Allows the agent to read full webpage contents (official `dsh-web-fetch-http` provider, pure JS, zero extra dependencies)
- **Platform Search (`platform_search`)** — Search GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / Wikipedia / npm / YouTube / Vimeo / Juejin / Douban / Qiita (public APIs or keyless scraping, zero extra dependencies)
- **Vertical Lookups (`domain_search`)** — Direct lookup in 41 keyless vertical sources: packages/versions (PyPI, crates, GitHub releases, endoflife…), academia (arXiv, Crossref, OpenAlex, Semantic Scholar, PubMed, dblp, Zenodo…), security (NVD, OSV, CISA KEV), finance (SEC EDGAR, IMF, World Bank, CFETS, Yahoo Finance, CoinGecko…), **law (US Federal Register, US CourtListener, openlegaldata, UK legislation)**, news (Google News, GDELT) and more
- **Video Search (`video_search`)** — Find videos across the web via Bing Videos + DuckDuckGo Videos (keyless, mutual fallback), returning video links with titles and publisher/duration metadata
- **One-Call Research (`research`)** — Concurrent multi-engine search → candidate rerank → tiered body fetch → window selection → an evidence pack with provenance as Markdown; every model component (rerank / embedding / decision model) is optional and silently falls back to the rule path when missing or failing
- **Search Fetched Bodies (`cache_search`)** — Full-text search over the bodies `research` already fetched (`node:sqlite` persistent cache, 7-day retention; degrades to a no-op whenever `node:sqlite` is unavailable — unflagged from 22.13, while 22.5–22.12 needs `--experimental-sqlite`)
- **Clean Integration** — Implements the official `WebSearchProvider` seam interface, coexisting seamlessly with official plugins

If this plugin has been helpful, a ⭐ on [GitHub](https://github.com/DDDMUC/dsh-free-search) would mean a lot — it's the biggest motivation for the developer to keep maintaining it. Thank you!

### Supported Engines

| id | Engine | Cost | Description |
|---|---|---|---|
| `auto` | Auto Smart Routing | Dynamic | **Smartly routes engines based on query language/time filter** (Chinese queries prioritize Bing/Baidu/Aliyun/AnySearch, English queries prioritize Bing/Exa/Tavily; time filters prioritize time-capable engines), with full fallback |
| `ddg` | DuckDuckGo HTML | Free | Occasional rate limits (anti-bot challenges); recovers automatically |
| `ddg-lite` | DuckDuckGo Lite | Free | Lightweight version; same rate-limit behavior as above |
| `bing` | Bing | Free | **Default engine**, most stable, optimized for Chinese (`zh-CN`) |
| `anysearch` | AnySearch AI | Free | AI search, no key needed (anonymous quota) |
| `searxng` | SearXNG Meta Search | Free | Multi-instance automatic failover; supports custom instances |
| `degoog` | Degoog (self-hosted aggregator) | Free | Needs your own instance (`degoogInstances`), no key; `degoogApiKey` (Bearer) only if the instance enables API keys |
| `exa` | Exa | Free | **Usable without a key** (anonymous MCP); configure a key for higher quota |
| `tavily` | Tavily | Free | **Usable without a key** (keyless anonymous); configure a key for higher quota |
| `keenable` | Keenable | Free | **Usable without a key** (anonymous MCP); configure a key for higher quota |
| `firecrawl` | Firecrawl | Free | **Usable without a key** (official keyless anonymous quota); a key adds higher limits. Note: the keyless tier is judged by **egress IP** — VPN/proxy egress gets a 403, in which case the plugin cools it down for 6 hours and says why (a key is unaffected) |
| `parallel` | Parallel | Free | **Works without a key** (official MCP anonymous quota); a key raises limits and enables precise time filtering |
| `you` | You.com | Free | **Works without a key** (official keyless tier, 100 searches a day); set `YDC_API_KEY` for higher limits (the old `YOUCOM_API_KEY` name still works) |
| `perplexity` | Perplexity | Paid | Requires `PERPLEXITY_API_KEY` |
| `serpbase` | SerpBase | Paid | Requires `SERPBASE_API_KEY` (serpbase.dev, 100 free queries on signup) |
| `serply` | Serply | Paid | Requires `SERPLY_API_KEY` (serply.io, 2,500 free credits for the first 30 days); Google web results localized to the settings language |
| `deepseek-official` | DeepSeek Official | Paid | Requires `DEEPSEEK_API_KEY`; uses the Anthropic-compatible `web_search` server tool, so every search is a full model turn (slow, token-billed) |
| `deepseek-tools` | DeepSeek Native Search API | Paid | Requires `DEEPSEEK_API_KEY` (shared with the row above); calls `POST /v1/tools/search` directly, no model involved, returns structured `results[]` (`title`/`url`/`summary`/`date`) — measured ~0.3s vs ~5-6s for the row above on the same query |
| `baidu` | Baidu Qianfan AI Search | Quota | Requires `BAIDU_API_KEY` (Qianfan AI Search, 50 free calls/day then pay-as-you-go); Chinese web-wide, supports time filtering |
| `kimi` | Kimi (Moonshot) Web Search | Paid | Requires `MOONSHOT_API_KEY` (basic ~¥0.01/call); returns Chinese results with body chunks; **no free quota**, so prefer explicit selection or the escalation pool over the default concurrent pool |
| `kimi` | Kimi (Moonshot) Web Search | Paid | Requires `MOONSHOT_API_KEY` (basic ~¥0.01/call); returns Chinese results with body chunks |
| `aliyun` | Aliyun Bailian EnhancedSearch | Paid | Requires `DASHSCOPE_API_KEY` (MCP search_pro, ~¥0.03/call, 200 free calls for new users); Chinese web-wide with source hostnames |
| `doubao` | Volcano Web Search (Doubao) | Free quota | Requires `DOUBAO_SEARCH_API_KEY` (open it in the Web Search console; **500 free queries/month**, pay-as-you-go beyond); strong for fresh Chinese content, supports time/site filters, returns long summaries |
| `zhihu_global` | Zhihu web-wide search (open-platform MCP) | Free quota | Requires `ZHIHU_API_KEY`; **5,000 calls/day trial quota** (paid access after the trial); supports the time filter (`publish_time`); skipped automatically when no key is set |
| `zhihu_site` | Zhihu site search (open-platform MCP) | Free quota | Requires `ZHIHU_API_KEY`; **5,000 calls/day trial quota** (shared with `zhihu_global`); time filtering not offered |
| `zhihu_global` | Zhihu web-wide search (open-platform MCP) | Paid | Requires `ZHIHU_API_KEY`; supports the time filter (`publish_time`); skipped automatically when no key is set |
| `zhihu_site` | Zhihu site search (open-platform MCP) | Paid | Requires `ZHIHU_API_KEY`; time filtering not verified, so it is not offered |
| `openai` | OpenAI built-in web search | Paid | Requires `OPENAI_API_KEY`; uses the Responses API `web_search` tool and returns a cited answer. **Billed per search, explicit selection only** (never picked by the fallback chain or Auto); default `gpt-6-luna`, model/endpoint configurable (`openaiModel` / `openaiBaseUrl`) |
| `gemini` | Gemini grounding with Google Search | Paid | Requires `GEMINI_API_KEY` (falls back to `GOOGLE_API_KEY`); uses the recommended **Interactions API** (`POST /v1beta/interactions`, `tools:[{type:"google_search"}]`) and reads citations from `steps[].content[].annotations`. **Billed per search, explicit selection only**; default `gemini-3.8-flash`, model/endpoint configurable (`geminiModel` / `geminiBaseUrl`) |
| `claude` | Claude server-side web_search | Paid | Requires `ANTHROPIC_API_KEY`; results come from `web_search_tool_result`. **Billed per search, explicit selection only**; default `claude-sonnet-5-5`, model/endpoint configurable (`claudeModel` / `claudeBaseUrl`) |

- **Default engine is `bing`** (free and most stable), ready to use out of the box after installation.
- **Auto-failover**: any engine failure (rate-limited free engine, or missing/invalid paid key, network error) automatically tries the next engine — the configured engine first, then other engines (exa/tavily/keenable/firecrawl/parallel/you are tried even without a key because they have built-in keyless quota), then the remaining free engines (Bing/AnySearch etc.) — with a note attached to the results naming the engine that actually served them (e.g. `Note: perplexity unavailable or failed, using exa.`). Search never fails outright because of engine issues.
- **Official Links in Settings**: Free engines display "Visit Website →", while paid engines display "Get API Key →" (opens in a new tab):
  - Exa: <https://dashboard.exa.ai/api-keys>
  - Tavily: <https://app.tavily.com/home>
  - Keenable: <https://keenable.ai/login>
  - Parallel: <https://platform.parallel.ai>
  - Perplexity: <https://www.perplexity.ai/settings/api>
  - SerpBase: <https://serpbase.dev>
  - Serply: <https://serply.io> (API docs: <https://serply.io/docs>)
  - DeepSeek: <https://platform.deepseek.com/api_keys>
  - Doubao / Volcano Web Search: <https://console.volcengine.com/search-infinity/web-search>
  - You.com: <https://you.com/platform/api-keys>

#### Engine quota tiers
#### Why are some engines free?

The free/paid binary is not what decides **who belongs in a default pool** — the real constraint is the quota model: is there a free allowance, how much, and what happens past it. Five tiers (pick concurrent pools from these, so a full-pool run does not silently multiply quota):

| Tier | Engines | Past the allowance |
|---|---|---|
| ① Unlimited, no key | `ddg` / `ddg-lite` / `bing` / `searxng` / `anysearch` | — |
| ② Anonymous quota (runs without a key) | `exa` / `tavily` / `keenable` / `firecrawl` / `parallel` / `you` (100/day) | key raises the quota |
| ③ Free quota (key required) | `zhihu_global` / `zhihu_site` (5,000/day trial), `doubao` (500/month), `baidu` (50/day), `aliyun` (200-call starter pack) | pay-as-you-go |
| ④ Paid upgrade (needs a key to return anything) | `serpbase` (100 free on signup) / `serply` (2,500 for 30 days) / `perplexity` / `deepseek-official` / `deepseek-tools` / `kimi` | per call / per query |
| ⑤ Per-call billing (model built-in, explicit-only) | `openai` / `gemini` / `claude` | per token + per search |

Rule of thumb for a default pool: **① as the floor + ③ as the workhorse**; ② is allowed but remember it burns anonymous quota; ④ only when you actually want that source; ⑤ never enters a pool. Per-engine facts and a default-pool proposal live in [docs/engine-quota-tiers.md](./docs/engine-quota-tiers.md).

#### Why do some engines not need a key?

- **AnySearch**: its `v1/search` REST endpoint provides anonymous public search quota without registration or an API key. Quota is rate-limited (fine for daily queries), but as one of the free engines with mutual fallback it stays reliable.
- **Exa**: its public MCP endpoint (`mcp.exa.ai/mcp`) supports anonymous requests, so it works without a key; configuring `EXA_API_KEY` grants a higher usage quota.
- **Tavily**: offers keyless anonymous quota via the `x-tavily-access-mode: keyless` header — it works without a key; configuring `TAVILY_API_KEY` switches to the account tier for higher quota and more stable results.
- **Keenable**: without a key it is called via its public MCP endpoint (`api.keenable.ai/mcp`); configuring `KEENABLE_API_KEY` switches to the REST API (`api.keenable.ai/v1/search`) for higher quota and organization-scoped rate limits.
- **Firecrawl**: its `/v2/search` endpoint works **without a key** out of the box (the official docs state "No API key needed to get started", with anonymous rate limits); configuring `FIRECRAWL_API_KEY` raises the limits. Supports `tbs` time filtering (`qdr:h/d/w/m/y` and custom date ranges).
- **You.com**: without a key it calls the official keyless tier (`api.you.com/v1/agents/search`), 100 free searches a day with no signup; setting `YDC_API_KEY` (the old `YOUCOM_API_KEY` name still works) switches to the Search API (`ydc-index.io/v1/search`) for higher limits.

### Installation

```sh
git clone https://github.com/DDDMUC/dsh-free-search.git
dsh plugin --profile web add /path/to/dsh-free-search
```

Then restart:

```sh
dsh web
```

#### Takeover behavior and verification

The plugin **takes over search** once loaded:

- When `web.searchProvider` is unset, or still the shipped default `deepseek-official`, it switches to this plugin's provider (id: `ddg`);
- If you (or another plugin) explicitly selected a different provider, it does not steal it — it only logs a WARN with a copy-pasteable YAML snippet.

**The takeover is persisted into the profile (DSH 0.2.x).** Since `0.2.0-rc.2` the provider selection lives in volatile config refs and can only be written through `settings.mutate("web", …)`, which lands in `profiles/<profile>/cordis.patch.yml` as:

```yaml
- id: web
  config:
    searchProvider: ddg
    fetchProvider: fs-quality-fetch
```

So **remove those `- id: web` lines before disabling or uninstalling this plugin** (or delete the whole row and let DSH fall back to its defaults). Otherwise the config still points at `ddg` while nothing registers it, and every search fails with:

```
Error: configured web provider "ddg" is not registered
```

Older DSH (0.1.x) used a static patch layer for this; writing that row by hand there is neither needed nor recommended.

#### DSH's "DeepSeek search API" switch

DSH 0.2.1 has Settings → Web search → **DeepSeek search API**, which interacts with this plugin:

| Action | Result |
|---|---|
| Turn the switch on | `web.searchProvider` becomes `deepseek-search-api` (an explicit choice), so **this plugin steps aside** and search goes through the official direct API; fetch becomes `deepseek-fetch-api` as well |
| Turn the switch off | DSH deletes the whole `- id: web` row, so the provider falls back to the shipped default `deepseek-official` — that is **model search** (a full auxiliary request, ~12 s in practice, billed per token), not the free engines |
| After turning it off | **Since 0.9.8**: the plugin notices `deepseek-official` and re-takes at runtime (log line `DSH's search switch put the web providers back to the official defaults — re-took …`), normally within seconds; if it does not, restart DSH |

Use `/free-search-engine` or this plugin's settings page to change engines, **not that switch**. Turning it on and then off drops you from the official direct API back to model search until the plugin re-takes over or DSH restarts.

> If you hand-wrote `- id: web` back in the 0.1.x era, you can drop it now: 0.2.x writes it at runtime. If you do declare it by hand, `fetchProvider` should be `fs-quality-fetch` (the fetch provider this plugin registers), not `http`.

- `searchProvider: ddg` — this plugin's **fixed provider id**, not "use the DuckDuckGo engine"; the engine is chosen by the `provider` field in settings (`bing` / `baidu` / `auto` / …).
- `fetchProvider: fs-quality-fetch` — this plugin's fetch provider (direct → exa contents → firecrawl → crawl4ai).
- To go back to official search: **remove those `- id: web` lines first, then disable this plugin** in the plugin manager.

#### Sister Plugin: dsh-preset-workbench

A **sister plugin** by the same author: a **visual workbench for creating/editing agent presets** right inside Settings — sectioned prompts, 15 capability toggles, and built-in "Whale Girl / Liangshen Mode" templates, no YAML needed. Pair them up: **free-search gives your AI web search, preset-workbench shapes its persona & capabilities** — both free and zero-config.

- Repo: <https://github.com/DDDMUC/dsh-preset-workbench>
- Install: `dsh plugin --profile web add github:DDDMUC/dsh-preset-workbench`
- Usage: Settings → Preset Workbench

If preset-workbench is useful to you too, a ⭐ on its repo is always welcome. 🙏

#### Dependency Note

This plugin intentionally specifies `@deepseek-ai/dsh-settings` and `@deepseek-ai/dsh-tools` as `peerDependencies`: the DSH runtime must use a single instance from the installation tree. Always install the plugin using `dsh plugin --profile <profile> add ...`. Do **not** copy DSH core packages into a profile-local `node_modules`, as duplicate copies can break the tool scheduler.

### Usage

#### Web Settings (Recommended)

After installation, open the config page (DSH 0.1.7-rc.1+):

- Sidebar **Plugins** page → **Installed** group → `free-search` → click the `web-search-free` component row (the row's "configure" entry)

The config page provides:

- **Search engine**: Select an engine from the dropdown; changes take effect immediately upon saving.
- **API keys**: Enter keys for Exa / Tavily / Keenable / Firecrawl / Parallel / Perplexity / DeepSeek / You.com (password fields; displayed as "configured" once saved; Exa / Tavily / Keenable / Firecrawl / Parallel / You.com work without a key too).
  - **Recommended**: store paid-engine keys in the harness credential center `~/.dsh/.credentials.yaml` (e.g. `DEEPSEEK_API_KEY: sk-...`, same as the official LLM providers — one place for all keys). Resolution order: credentials center > settings page > environment variable; the settings-page fields remain for backward compatibility.
- **Test engine**: Tests the selected engine directly (no fallback chain; paid engines without a key report an explicit error).
- **Use Bing default**: stage a switch back to the stable free Bing engine; `Discard` only cancels unsaved edits
- **Platform search**: check platforms (GitHub / V2EX / Bilibili / Reddit / HN / Stack Overflow / Wikipedia / npm / YouTube / Vimeo / Juejin / Douban / Qiita) to enable them for the `platform_search` tool (disabled platforms are skipped).
- **EN / 中文**: toggle the interface language (default Chinese).

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

#### Switching Engines from the Chat (/free-search-engine)

You can also switch the engine right from the chat — no need to open the settings page. Type `/free-search-engine`: a **picker opens with all engines** (the same interaction as `/model` for selecting a model). Click one to switch; the current engine is marked. Equivalent to switching and saving in the settings page, and the language follows the settings page (Chinese/English).

The command only changes the preferred engine; search still goes through `web_search` + the unified fallback chain — even if the preferred engine fails, it automatically switches to others, never failing outright. The system prompt refreshes accordingly.

#### Engine Switches, Fallback Priority and Multi Mode

The settings page has these blocks (all saved into the entry config):

- **Globally enabled engines**: unchecking an engine excludes it everywhere — the web_search fallback chain, Auto routing, `advanced_search`, `multi_search` and engine tests. At least one engine must remain enabled.
- **Global fallback priority**: use ↑↓ to reorder. The preferred engine is still tried first; Auto keeps its language/time routing, while a customized order governs engines inside a route group and the remaining fallback chain. Disabled engines stay in the list (marked "disabled") but are skipped; "Reset default order" restores the defaults.
- **Chinese query pool (zhPool) / English query pool (enPool)**: the route head for Auto and the concurrent pool for Multi. Picked automatically by query language (CJK scripts go to the zh pool, everything else to en). Both pools support ↑↓ reordering, adding engines from a dropdown and removing with "−" (**minimum 2 engines per pool, no upper limit**). Defaults: zh `bing / baidu / aliyun / anysearch`, en `bing / exa / tavily`; disabled/cooling/keyless engines are skipped at runtime.
- **`Multi Search` in the engine dropdown**: web_search then queries **every enabled engine of the query's language pool** concurrently (no longer top 3), merges/deduplicates URLs and prioritizes cross-source hits. Running a whole pool multiplies quota usage (mind engines billed per credit); if a multi run fails it automatically falls back to the single-engine chain and says so in the result note.

#### Failure-aware fallback

The fallback chain no longer treats every failure the same way — it classifies them first (issue #36):

- **`quota`** (HTTP 402 / `NO_MORE_CREDITS` / SerpBase free quota exhausted): fail over immediately and put the engine on a **process-wide cooldown**, so later searches stop hammering an engine that cannot succeed;
- **`auth`** (401/403, invalid or missing key): same — cooled for the rest of the session (reload the plugin after fixing the key);
- **`bot-wall`** (e.g. the DDG anti-bot challenge): cools down for a short while (60s by default), then rejoins the chain;
- **`transient`** (timeout / 5xx / network / 429 rate limit): the engine is **retried once** before advancing, so a single blip does not drop a good engine;
- **`invalid-response`** (parse failure / schema change / 0 results): still fails over, but is reported as a plugin-side issue and does not cool the engine down.

The `Note:` line now names the class, e.g. `Note: exa is out of quota, using doubao.`, `Note: perplexity is misconfigured (API key rejected), using doubao.`, `Note: bing failed (transient), using doubao.`. `free_search_test` also reports the class per failed engine (`failureClass`).

Cooldowns are per-process (reloading the plugin or restarting clears them) and apply to the configured preferred engine too: if it is cooling down, this run skips it, fails over and says `is cooling down`. An engine that succeeds is automatically un-cooled.

`fallbackOn` decides which failure classes are **allowed** to trigger a fallback: by default all six are checked, i.e. today's "search never fails outright". Unchecking a class makes such a failure **stop the search and surface that engine's error** instead of trying another engine (e.g. drop `invalid-response` and a preferred engine that returns nothing/parses badly fails loudly rather than silently handing you a lower-quality engine's results). An empty array `[]` aborts on any failure. Note that **missing keys, disabled engines and unsupported time filters are not failures** and always advance. There is a matching checkbox group in the settings page, and you can also write `fallbackOn: [quota, auth, bot-wall, transient, invalid-response, unknown]` in the config.

#### Safe Search (`safeSearch`)

`safeSearch` controls whether the built-in sources apply an extra safety filter. Default is `off` (no parameter is added — each engine keeps its own default):

| Value | Meaning |
|---|---|
| `off` (default) | no filter parameter; engine default behavior |
| `moderate` | filter adult content |
| `strict` | strictest filtering |

It applies to **Bing** (`adlt`), **DuckDuckGo HTML** (`adlt`), and **DuckDuckGo Lite** (`adlt`). Other engines have no such parameter and are unaffected. There is a dropdown in the settings page; you can also write `safeSearch: moderate` in the config.

#### Fetch provider takeover (conflicts with other fetch plugins)

At runtime the plugin tries to take over `web.fetchProvider`:

- unset, or still the factory default `http` → taken over as `fs-quality-fetch` (direct → exa contents → firecrawl → crawl4ai);
- **explicitly pointed at another provider** (e.g. `playwright`) → **not stolen**, one log line only (once per process).

If you also run a plugin that registers a fetch provider (`dsh-web-fetch-playwright`, `dsh-chatgpt-subscription`, …), **make one of them step aside** in the profile's `cordis.patch.yml`:

```yaml
- id: web
  config:
    fetchProvider: playwright   # use theirs; this plugin only takes over search
```

Otherwise startup can loop on "write the `web` config → the web service rebuilds → the plugin re-applies" (see issue #82).

If you deliberately pinned `fetchProvider: http` (you only want the built-in fetcher), set `fetchProviderTakeover: false`: `http` is no longer treated as the factory default, while a completely unset provider is still filled in.

`searchProvider` follows the same rule: taken over when unset or still `deepseek-official`, never when explicitly pointed elsewhere.

#### Configuration File

Since DSH 0.1.7-rc.1 the configuration is stored with the profile's plugin entry: the settings page and `/free-search-engine` both write the `config` of the `web-search-free` (`dsh-free-search`) entry in the active profile's `cordis.patch.yml`.

The old `free-search:` section of `~/.dsh/settings.yaml` is **not** imported by the DSH core (`importLegacyDocument` only maps `ui-developer-tools` / `ui-onboarding` / `shell`); the file is renamed to `settings.yaml.imported` after the other sections are imported, and the section's values stay there. The plugin detects that section in `settings.yaml.imported` (or in a still-present `settings.yaml`) at startup and seeds the recognized fields into this entry's `config` **once** (watch for `free-search: migrated N field(s)…` in the startup log). You can also migrate manually by copying the values from `settings.yaml.imported` into the plugin row config.

```yaml
# config of that entry in profiles/<profile>/cordis.patch.yml:
provider: bing              # ddg / ddg-lite / bing / searxng / anysearch / exa / tavily / keenable / firecrawl / parallel / perplexity / serpbase / serply / deepseek-official / deepseek-tools / you / baidu / kimi / aliyun / doubao / zhihu_global / zhihu_site / openai / gemini / claude / auto / multi
fallbackOn: [quota, auth, bot-wall, transient, invalid-response, unknown]   # failure classes allowed to trigger fallback; [] = abort on any failure (default: all)
lang: zh                    # search language pools / localization (zh / en / ru …; no longer rewritten by the settings page)
#   lang drives Bing's mkt/Accept-Language, the Wikipedia subdomain (ja → ja.wikipedia.org) and the geocoding language;
#   text this plugin renders itself only exists in Chinese and English, so other languages (ja/ru/de…) get English rather than a wall of Chinese (#92);
#   weather also has Japanese (ja gets Japanese weather text, ru/de… still get English).
#   web_fetch (fs-quality-fetch) sends the same Accept-Language instead of a fixed Chinese one (#92).
uiLang: zh                  # settings UI language (zh / en); empty = follow lang
bingMarket: zh-CN           # Bing market; empty = automatic (no mkt sent)
fetchProviderTakeover: true # false = keep the fetchProvider: http you pinned yourself
region: cn-zh               # DuckDuckGo region (optional)
searxngInstances:           # Custom SearXNG instances (optional)
  - https://your-instance.example
searxngBearerToken: ...      # Optional: send Authorization: Bearer <token> (same as the "SearXNG Bearer Token" row in the settings UI)
degoogInstances:           # Self-hosted degoog instances (optional, e.g. https://search.example.com)
  - https://search.example.com
degoogApiKey: ...          # Optional: bearer key, only when your instance enables API keys
safeSearch: off              # Safe search: off (default) / moderate / strict; applies to bing / ddg / ddg-lite
blockedDomains:              # Domain blocklist (optional): matching domains never enter the results
  - spam-example.com
multiMaxEngines: 0           # multi concurrency cap (0 = unlimited, whole language pool); the settings UI has Fast/Balanced/Deep presets
multiMinSources: 1           # multi target source count (only triggers top-up runs; not a hard minimum)
exaApiKey: ...              # Or configure via the web settings UI
tavilyApiKey: ...           # Or configure via the web settings UI
keenableApiKey: ...         # Or configure via the web settings UI
firecrawlApiKey: ...        # Or configure via the web settings UI
parallelApiKey: ...         # Or configure via the web settings UI
perplexityApiKey: ...
serpbaseApiKey: ...         # Or configure via the web settings UI
serplyApiKey: ...           # Or configure via the web settings UI
deepseekApiKey: ...
```

#### Asking the Agent to Test All Engines

Tell the agent *"Test all search engines"*, and it will call the `free_search_test` tool to check each engine sequentially and report back:

```
Search engine test:
- ddg: FAIL - DuckDuckGo is rate-limited right now (anti-bot challenge, usually temporary) - Bing works
- bing: OK (2 results, e.g. "DeepSeek Harness developer preview...")
- exa: FAIL - EXA_API_KEY not configured
```

#### Time Filtering (`advanced_search`)

Ask the agent for *"news from the last week"*, *"releases this month"*, *"updates from the last 3 days"*, or *"posts since July"*, and it will call the `advanced_search` tool with a `timeRange` parameter. It uses the same unified fallback chain, can force a specific `engine`, and returns the same shape as `web_search`.

**The `timeRange` parameter accepts three forms:**

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
| DeepSeek Native Search (`deepseek-tools`) | `after:` query syntax | ✅ precise | the endpoint has no dedicated date field, so `after:YYYY-MM-DD` is appended to the query; relative day counts are converted to an N-days-ago date |

**Nearest-tier mapping rule**: `≤2 days → day`, `≤14 days → week`, `≤90 days → month`, otherwise `year`. For example, `3d` becomes `day` on Tavily, and `2mo` becomes `month`.

**Engine-chain priority**: when a `timeRange` is present, engines that support time filtering (tavily / exa / keenable / firecrawl / parallel / searxng / ddg / ddg-lite / deepseek-tools) are moved to the front of the fallback chain, so the filter actually takes effect — even if the preferred engine is bing (which does not support filtering), a filtering-capable engine is tried first.

Example: *"Find DSH news from the last 3 days"* → agent calls `advanced_search` with `timeRange: "3d"`.

#### Multi-Engine Concurrent Search (`multi_search`)

When you need **cross-source verification** to prevent biases or fail-safes from a single engine, the agent can call `multi_search`:

- **Concurrent Execution**: Defaults to querying **every engine of the query's language pool** (no longer top 3; or an explicit list passed via `engines`). Each engine independently resolves API keys and handles errors (missing keys are skipped without failing the batch).
- **Three presets** (radio buttons in the settings UI; the choice is written to the config immediately):

  | Preset | Concurrency cap | Target sources |
  |---|---|---|
  | `Fast · 1/1` | 1 | 1 |
  | `Balanced · 3/1` | 3 | 1 |
  | `Deep · 6/2` | 6 | 2 |

  Typing your own numbers below the buttons counts as "custom" and no preset appears selected.
- **Concurrency cap** (`multiMaxEngines`, default `0` = **unlimited**, the whole language pool): this is a **ceiling, not a floor** — the actual fan-out is `min(cap, credential-eligible engines)`. Credential eligibility is resolved **before** truncation, so keyless engines never occupy slots (3 eligible engines with a cap of 6 still run all 3).
- **Target source count** (`multiMinSources`, default `1`): **not a hard minimum**. It only triggers top-up runs — when too few sources have returned, the remaining eligible engines run **serially** in domain round-robin order; once they are exhausted or time runs out, the results in hand are returned (coming up short is not an error).
- **30-second total budget** (`SEARCH_BUDGET_MS`): the fan-out and every top-up run share one deadline; at expiry the plugin stops and returns **whatever it already has**, so one slow engine cannot stall the whole search.
- **Deduplication & Merge**: Normalizes URLs (drops trailing slashes and audited tracking params) and ranks items by the number of engines that found them (`seenIn` counts), with cross-hit results placed at the top; **same-site detection uses eTLD+1** — `a.example.co.uk` and `b.example.co.uk` count as one site, so domain-diversity rotation happens at the **site** level and cannot be flooded by many subdomains.
- **Untrusted Boundary**: Enforces the `<untrusted-web-content>` safety wrapper and trims snippets.
- ⚠️ Note: Running multiple engines in parallel consumes more search quota; use on demand when high source diversity is needed.

#### Output contract (meta.uncertainty)

`advanced_search` and `multi_search` now return an optional `meta.uncertainty` field describing how much the result should be trusted; the existing `provider` / `content` / `sources` shape is unchanged:

```json
{ "provider": "multi", "sources": [ ... ],
  "meta": { "uncertainty": { "level": "medium", "notes": ["only two sources"] } } }
```

- `level`: `high` / `medium` / `low`, derived from the number of sources, whether they all come from one site, a time filter without publish dates, aggregator hosts, and whether any engine failed;
- `notes`: readable reasons; usually empty at `high`;
- the rendered text appends a `Confidence: …` line whenever the level is not `high`.

This is the **small step**: additive fields only, existing parsers keep working.
#### Fetch Webpage Content (`web_fetch`)

After searching, the agent can **read full webpage content** (e.g., *"Open the first link and summarize it"*). The `web_fetch` tool is enabled by default (official `dsh-web-fetch-http` provider):

- Automatically follows redirects and decodes HTML to plain text.
- Supports timeout and response size limits.
- ⚠️ Note: `web_fetch` does not have SSRF protection; the agent could theoretically access internal network addresses. Use as needed.

#### Platform Search (`platform_search`)

Ask the agent to search specific platforms (e.g., *"Search GitHub for deepseek harness"*, *"Find related videos on Bilibili"*, or *"Discussions about dsh on V2EX"*). The `platform_search` tool supports:

| Platform | Purpose |
|---|---|
| `github` | GitHub repository search (public API, free, no key required) |
| `v2ex` | V2EX hot / relevant topics |
| `bilibili` | Bilibili video / content search (public API) |
| `reddit` | Reddit posts / discussions (public JSON API; may be blocked by Reddit anti-bot in some network environments) |
| `hn` | Hacker News tech community discussions (official Algolia API) |
| `stackoverflow` | Stack Overflow Q&A (official public Stack Exchange API) |
| `wikipedia` | Wikipedia articles (zh.wikipedia.org for Chinese; switches to en.wikipedia.org when `lang: en`) |
| `npm` | npm package search (registry official API) |
| `youtube` | YouTube video search (scrapes the results page `ytInitialData`, keyless) |
| `vimeo` | Vimeo video search (scrapes the search page's embedded data; falls back to web search `site:vimeo.com`, keyless) |

These rely on public endpoints or keyless scraping, with zero external dependencies and no API keys. `youtube` / `vimeo` must first be enabled in Settings → Platform search.

#### Video Search (`video_search`)

Ask the agent to find videos: *"find some videos about X"*, *"any tutorials for Y"*. `video_search` searches across the web:

| Source | Notes |
|---|---|
| `bing` | Bing Videos (scrapes the `vrhm` metadata on `bing.com/videos/search`, keyless) |
| `ddg` | DuckDuckGo Videos (vqd + `v.js`, keyless) |

Both sources are tried by default with mutual fallback, returning `url / title / snippet` (publisher, duration, etc.). **Keyless scraping — may break if the site changes its markup**; to search a specific site (YouTube / Vimeo / Bilibili) use `platform_search`.

#### One-Call Research (`research`)

`research` gives the agent an evidence pack with provenance in a single call: concurrent multi-engine search → candidate rerank → tiered body fetch → window selection → Markdown brief. Use it when a question needs multi-source verification, instead of chaining `web_search` + `web_fetch` yourself.

- **Arguments**: `question` (the question itself) and `depth` (how many bodies to fetch in full, 1–5, default 3; rounded and clamped to that range).
- **Output**: `sources` (search hits), `documents` (fetched bodies, each with `kind`, `text_origin`, `tier`, `published`, `fetched_at`, `engine_hits` and more), `notes` (execution notes) and `estimatedTokens`.
- **Shared budget**: every stage shares a 90-second deadline (`DEADLINE_MS`) and a cap of 12 search calls (`SEARCH_REQUESTS_MAX`). When time is up, in-flight requests are cancelled, queued work does not start, and the partial results collected so far are returned with `deadline_hit` or `budget_exhausted` recorded in `notes`.
- **Degradation**: if rerank, embedding or the decision model fails, the chain silently falls back to the rule path and keeps going; when fetching fails it degrades to search snippets only (`snippets only`).
- **Untrusted boundary**: the returned brief is wrapped in `<untrusted-web-content>`.

Behavior without keys (**the basic path stays usable and never breaks over a missing key**):

| Key not configured | Effect |
|---|---|
| `SILICONFLOW_RERANK_API_KEY` | Candidate rerank and window model scoring are skipped in favor of light filtering; the pre-fetch semantic cluster tagging is skipped too. The fallback path is recorded in `notes` |
| `DECISION_MODEL_API_KEY` / `DECISION_MODEL_URL` | The decision model is fully off (`decide()` returns null immediately): intent judging, the sufficiency gate and rewrite picking all use the rule path. Both must be set for it to run |
| `EXA_API_KEY` / `FIRECRAWL_API_KEY` / `CRAWL4AI_API_KEY` | The corresponding tier of the fetch chain is skipped; the other tiers still run |

> The decision-model endpoint is **off by default** (`DECISION_MODEL_URL` defaults to an empty string): no third-party endpoint is called unless you configure one.

#### Search Fetched Bodies (`cache_search`)

`cache_search` full-text searches the bodies `research` already fetched, so you can look back at earlier findings without re-fetching.

- **Arguments**: `query` (text to look for) and `limit` (max entries, default 8, up to 20).
- **Returns**: `url` / `title` / `excerpt` / `fetched_at`, also wrapped in `<untrusted-web-content>`.
- **Where it lives, and how to clear it**: defaults to `~/.cache/dsh-free-search/research.db`; set `RESEARCH_CACHE_DIR` to relocate it (a backup drive, or wherever you want it to travel with). **To clear it**: delete that directory — there is no background job and nothing left in the registry. Entries expire after 7 days and are pruned lazily on query, so stale rows never reach your results.
- **`node:sqlite` unavailable**: when `node:sqlite` cannot be loaded, the cache is disabled entirely (no-op) — `research` still runs, `cache_search` returns an empty array, and the plugin never errors out over it. `node:sqlite` is unflagged from v22.13.0 / v23.4.0; 22.5–22.12 needs `--experimental-sqlite`, otherwise it takes the same no-op path.

### Local Engine Switcher (`tools/`)

The `tools/` directory includes a lightweight, zero-dependency switcher:

- **`启动搜索引擎切换器.cmd`** (Windows) — Double-click to launch a local Node server (`http://127.0.0.1:4789`) and automatically open the engine selector page in your browser.
- **`switch-engine.html`** — The selector UI: displays current engine status and allows one-click switching.
- **`server.mjs`** — The local backend service responsible for reading/writing `~/.dsh/profiles/web/cordis.patch.yml`.
- **`switch-engine.ps1`** — Headless PowerShell script: `powershell -File tools/switch-engine.ps1 -Engine bing`.

Restart `dsh web` after switching to apply changes.

#### Offline self-check assertions (`tools/`)

**Twenty-seven** zero-dependency assertion scripts ship with the repo (**592 assertions** total): **no API keys, no network, no test framework**, Node ≥ 20:

| Script | Covers | Run (count) |
|---|---|---|
| `assert-engines.mjs` | engine registry / free-engine rule / language-pool routing / pool config fields / Zhihu URL utm stripping / `deepseek-tools` wiring and snippetCap widening | `node tools/assert-engines.mjs` (41) |
| `assert-blocked-domains.mjs` | domain blocklist: parsing, matching, choke points, and byte-identical front/back-end sanitizing | `node tools/assert-blocked-domains.mjs` (69) |
| `assert-multi-policy.mjs` | multi execution policy: ceiling semantics / target-is-not-a-hard-minimum / credential eligibility before the ceiling / **Fast·Balanced·Deep presets** | `node tools/assert-multi-policy.mjs` (146) |
| `assert-result-ranking.mjs` | merged ranking: **eTLD+1 same-site detection** / domain round-robin / `seenIn` demoted / freshness only under a time filter | `node tools/assert-result-ranking.mjs` (31) |
| `assert-url-norm.mjs` | URL normalization: strips only audited tracking params, keeps params that may identify different resources | `node tools/assert-url-norm.mjs` (72) |
| `assert-prompt-contract.mjs` | system-prompt contract: **search ≠ fetch**, untrusted-data boundary, model engines only when explicitly selected | `node tools/assert-prompt-contract.mjs` (9) |
| `assert-research-degradation.mjs` | research degrades fully without keys, `node:sqlite` no-op, 90s budget isolation, configurable cache dir, `budget.exhausted` contract names | `node tools/assert-research-degradation.mjs` (19) |
| `assert-research-call-wrappers.mjs` | the four research `call*` wrappers proxy to stubs / the real layer (#75 regression) | `node tools/assert-research-call-wrappers.mjs` (23) |
| `assert-fetch-chain.mjs` | `fs-quality-fetch` tier ordering, stop-on-first-success, silent firecrawl degradation, aggregated all-tiers failure | `node tools/assert-fetch-chain.mjs` (8) |
| `assert-single-fetch-layer.mjs` | exactly one fetch implementation repo-wide, one-way deps, seams owned by the right layer | `node tools/assert-single-fetch-layer.mjs` (22) |
| `assert-vertical.mjs` | `domain_search` registry of 41 engines, per-engine descriptions, unknown-engine errors, no research dependency | `node tools/assert-vertical.mjs` (8) |
| `assert-free-search-test-schema.mjs` | `free_search_test` output schema matches real output (incl. auto/multi virtual modes) | `node tools/assert-free-search-test-schema.mjs` (8) |
| `assert-weather-contract.mjs` | `weather` output schema contract (field pruning, English output, empty geocode throws) | `node tools/assert-weather-contract.mjs` (11) |
| `assert-killtree-win32.mjs` | Windows process-tree termination (#74): no longer relies on `taskkill` | `node tools/assert-killtree-win32.mjs` (8) |
| `assert-killtree-portable.mjs` | portable `killTree` contract | `node tools/assert-killtree-portable.mjs` (5) |
| `assert-parallel-mcp.mjs` | Parallel MCP engine: the 25 s timeout / caller abort covers the **body read**, shared SSE parser (notifications, multiline frames), six error paths, REST precise time filtering | `node tools/assert-parallel-mcp.mjs` (15) |
| `assert-output-language.mjs` | language branches (#92): `searchLanguage` passes zh/en/ja/ru/de/es/fr/ko through and falls back to en, `outputLanguage` only returns zh/en, weather text has zh/en/ja (WMO descriptions and body; others fall back to English), and both confidence and failure notes follow the language | `node tools/assert-output-language.mjs` (10) |
| `assert-uncertainty.mjs` | output contract: 0/1 source is low, two sources or a single site is medium, three distinct domains is high, time filter without dates, failure notes, aggregator caveat | `node tools/assert-uncertainty.mjs` (8) |
| `assert-youcom.mjs` | You.com keyless tier (#90): both URLs and headers, no `X-API-Key` without a key, the `YDC_API_KEY` alias, and 429/401/402/5xx classification | `node tools/assert-youcom.mjs` (23) |
| `assert-tool-schema-size.mjs` | Tool schema budget (#94): one shared engine-id constant, no per-engine sentences in `domain_search`, the three schemas under 1.6k chars combined | `node tools/assert-tool-schema-size.mjs` (5) |
| `assert-degoog.mjs` | degoog self-hosted instance (#85): `/api/search` URL normalisation, query encoding, `time`/`lang` parameters, registry placement, no credentials needed | `node tools/assert-degoog.mjs` (7) |
| `assert-multikey.mjs` | multi-key fields: a single key is unchanged, comma/semicolon/newline separate keys, blank entries are dropped, empty input yields none | `node tools/assert-multikey.mjs` (3) |
| `assert-firecrawl-keyless.mjs` | Firecrawl keyless egress refusal: only a 403 with the VPN/proxy wording counts, plain 403 and 401/429/500 do not, and the cooldown starts inactive | `node tools/assert-firecrawl-keyless.mjs` (5) |
| `assert-fetch-charset.mjs` | fetch encoding (#88): `charset=gbk` / `gb2312` decoded as declared, `<meta charset>` and the http-equiv form sniffed when the header omits it, UTF-8 by default, and an unknown label falls back to UTF-8 instead of throwing | `node tools/assert-fetch-charset.mjs` (6) |
| `assert-fetch-abort.mjs` | fetch interruption (#87): a compressed response cut mid-body rejects instead of hanging forever, identity truncation rejects too, abort breaks a stalled gzip stream, and complete responses plus redirects still work | `node tools/assert-fetch-abort.mjs` (6) |
| `assert-bridge-access.mjs` | bridge Host fence (#84): loopback allowed, a remote peer behind a loopback Host refused, `--trusted-host` (port-less matches any port, explicit port matches exactly), `--public-url`, the bind address, cross-site and foreign-Origin refused | `node tools/assert-bridge-access.mjs` (11) |
| `assert-provider-takeover.mjs` | provider takeover: both the legacy property API and the rc.2 `config.*` refs, a single batched `settings.mutate(web)`, explicit foreign providers left untouched, an explicit `http` kept when `fetchProviderTakeover` is off, describe()-triggered events ignored when nothing changed, nested config changes and web rebuilds reported separately, re-takeover after DSH's search switch is turned off without fighting an explicit `deepseek-search-api`, apply re-entry / duplicate registrations tolerated, and repeated logs deduplicated | `node tools/assert-provider-takeover.mjs` (16) |

Any failure exits non-zero with the failing items listed. Passing the path of an older file shows the pre-fix failures (proving the assertions are not vacuous). Worth running before a release.

> The settings card mounts into the official `plugins.row.config` component-row slot on the sidebar Plugins page (built into DSH), and configuration reads/writes go through the plugin's own bridge. **No `dsh-web-ui` dependency — the plugin can be used standalone.**

### Proxy Note (for Users in Mainland China)

Engines like DuckDuckGo may require a proxy. Since Node.js `fetch` does not use the system proxy by default, set the following environment variables for the dsh process (Node 24+):

```sh
export NODE_USE_ENV_PROXY=1
export HTTPS_PROXY=http://127.0.0.1:7897   # Your proxy address
export HTTP_PROXY=http://127.0.0.1:7897
```

Windows users: The desktop shortcut already includes this configuration (`set NODE_USE_ENV_PROXY=1&& set HTTPS_PROXY=...`).

### How It Works

- `lib/index.js`: Host side. Implements `WebSearchProvider` (`id` / `available()` / `search()`), unified engine routing + auto-fallback (paid engines first, free as fallback); parses `timeRange` (fixed tiers / relative values / absolute dates) and forwards it to each engine; declares its editable config as volatile fields on the `web-search-free` composition entry and ships its own settings page (`plugins.row.config`); provides the `/api/dsh-free-search-settings` read/write bridge + `raw-search` debug endpoint; registers the `free_search_test`, `platform_search`, `video_search`, and `advanced_search` tools; dynamically injects the engine list into system prompts (auto-refreshes on settings change).
- `lib/client.js`: Browser side. React configuration card (engine select, key inputs, connectivity test, and Chinese/English toggle), mounted into the official `plugins.row.config` component-row slot on the sidebar Plugins page; registers the `/free-search-engine` popup switch command (`commandUi` popupSelect, the same mechanism as `/model`).
- `cordis.patch.yml`: Plugin loader configuration.

### License

MIT
