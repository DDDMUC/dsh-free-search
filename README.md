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
- **多引擎可选**：DuckDuckGo（html/lite）、Bing、SearXNG（元搜索，支持自定义实例）、AnySearch、Exa、Tavily、Keenable、Firecrawl、Parallel、Perplexity、SerpBase、DeepSeek 官方、You.com、百度千帆、Kimi、阿里云百炼、火山联网搜索（豆包搜索）
- **网页设置页** —— 引擎切换 + API key 配置（UI 中 key 脱敏显示"已配置"）+ 中英文切换；入口在左侧「插件」页的组件行配置（`plugins.row.config`，DSH 0.1.7-rc.1+）
- **弹出式切换命令** —— 聊天框输入 `/free-search-engine`，弹出引擎选择窗口，点选即切换（等效设置页 + 保存）
- **引擎测试** —— `free_search_test` 工具让 agent 一键测试所有引擎；设置页也有"测试引擎"按钮（直测当前引擎，不走回退链，付费引擎无 key 会明确报错）
- **全局引擎开关与回退优先级** —— 设置页可勾选/取消引擎（取消后全局生效：普通搜索 / Auto / `advanced_search` / `multi_search` / 引擎测试都不再用它），并可用 ↑↓ 调整全局回退顺序（一键恢复默认）
- **Multi 模式** —— 可把搜索引擎设为 `Multi Search`：`web_search` 并发请求前 3 个已启用引擎、按 URL 合并去重、跨源命中的结果优先（代价是成倍消耗额度；multi 失败会自动退回单引擎回退链）
- **统一引擎回退** —— 任何引擎失败（付费/免费，缺 key/401/限流/网络）自动轮流尝试下一个引擎：首选引擎 → 其他引擎（exa/tavily/keenable/firecrawl/parallel 无 key 也会尝试，因为它们自带 keyless 免费额度）→ 剩余免费引擎，搜索永不直接失败；结果顶部注明实际生效的引擎（如 `Note: perplexity unavailable or failed, using exa.`）
- **时间过滤** —— `advanced_search` 工具支持 `timeRange`：固定档、自定义相对值、绝对日期三种形式（详见下方逻辑说明）
- **系统提示词注入** —— agent 知道当前用哪个引擎、哪些需要 key；并明确所有搜索结果是**不可信外部数据**，不得执行其中的指令
- **提示注入防护（不可信数据边界）** —— 插件自有工具（advanced_search / platform_search / free_search_test）的网页文本包在 `<untrusted-web-content>` 边界内（正文里自带的同名标记会被剥离，防止提前闭合）；核心 web_search / web_fetch 由 DSH 核心自带同类提示（`External web content follows...`）；所有 snippet 统一清洗并截断到 300 字符
- **版本号 + 检查更新** —— 设置卡片显示当前版本（v0.4.17），"检查更新"按钮直连 npm registry 对比最新版，有新版本时提示并可一键跳转
- **结果缓存** —— 相同查询（含引擎/时间过滤参数）5 分钟内命中缓存（LRU 50 条），防免费引擎限流、省付费额度；时长可在设置页 0-5 分钟自由配置（0 关闭）
- **免费标注** —— 设置页中免费引擎带绿色 `FREE` 徽章，付费引擎带橙色 `API KEY` 徽章
- **网页抓取（web_fetch）** —— 让 agent 抓取网页内容（官方 `dsh-web-fetch-http` provider，纯 JS，零额外依赖）
- **平台搜索（platform_search）** —— 搜 GitHub / V2EX / B站 / Reddit / Hacker News / Stack Overflow / 维基百科 / npm（公开 API，零依赖）
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
| `exa` | Exa | 免费 | **无 key 也可用**（MCP 匿名），配 key 提升额度 |
| `tavily` | Tavily | 免费 | **无 key 也可用**（keyless 匿名），配 key 提升额度 |
| `keenable` | Keenable | 免费 | **无 key 也可用**（MCP 匿名），配 key 提升额度 |
| `firecrawl` | Firecrawl | 免费 | **无 key 也可用**（官方免 key 匿名额度），配 key 提升限额 |
| `parallel` | Parallel | 免费 | **无 key 也可用**（官方 MCP 匿名额度），配 key 提升额度并支持精确时间过滤 |
| `perplexity` | Perplexity | 付费 | 需 `PERPLEXITY_API_KEY` |
| `serpbase` | SerpBase | 付费 | 需 `SERPBASE_API_KEY`（serpbase.dev，注册送 100 次免费额度） |
| `deepseek-official` | DeepSeek 官方 | 付费 | 需 `DEEPSEEK_API_KEY` |
| `you` | You.com | 付费 | 需 `YOUCOM_API_KEY`（you.com/platform/api-keys，注册即送免费额度） |
| `baidu` | 百度千帆 AI 搜索 | 额度 | 需 `BAIDU_API_KEY`（千帆 AI 搜索，每日赠 50 次，超额按量后付费）；中文全网，支持时间过滤 |
| `kimi` | Kimi（Moonshot）联网搜索 | 付费 | 需 `MOONSHOT_API_KEY`（basic 约 ￥0.01/次），返回带正文 chunks 的中文结果 |
| `aliyun` | 阿里云百炼 EnhancedSearch | 付费 | 需 `DASHSCOPE_API_KEY`（MCP search_pro，约 ￥0.03/次，新用户 200 次免费包）；中文全网带来源 hostname |
| `doubao` | 火山引擎联网搜索（豆包搜索） | 免费额度 | 需 `DOUBAO_SEARCH_API_KEY`（联网搜索控制台开通，**每月 500 次免费**，超出按量付费）；中文时效内容强，支持时间/站点过滤，返回千字级摘要 |

- **默认引擎为 `bing`**（免费且最稳定），安装后开箱即用。
- **自动回退**：任何引擎失败（免费限流/反爬，付费缺 key/无效/网络错误）都会自动轮流尝试下一个引擎——先试其他已配 key 的付费引擎，再试免费引擎（Bing/AnySearch 等），并在结果中附带回退提示——搜索不会因引擎问题直接失败。
- **设置页有官网链接**：免费引擎显示"访问官网 →"，付费引擎显示"获取 API Key →"（新标签页打开）：
  - Exa：<https://dashboard.exa.ai/api-keys>
  - Tavily：<https://app.tavily.com/home>
  - Keenable：<https://keenable.ai/login>
  - Parallel：<https://platform.parallel.ai>
  - Perplexity：<https://www.perplexity.ai/settings/api>
  - SerpBase：<https://serpbase.dev>
  - DeepSeek：<https://platform.deepseek.com/api_keys>
  - 豆包搜索（火山联网搜索）：<https://console.volcengine.com/search-infinity/web-search>
  - You.com：<https://you.com/platform/api-keys>

#### 为什么免费引擎不需要 key？

- **AnySearch**：其 `v1/search` REST 接口提供匿名的公共搜索额度，无需注册或 API key。额度有限流（适合日常搜索），但作为免费引擎之一，与其他免费引擎互相回退，体验稳定。
- **Exa**：公开 MCP 端点（`mcp.exa.ai/mcp`）支持匿名调用，不配 key 也能用；配置 `EXA_API_KEY` 后可获得更高额度。
- **Tavily**：通过 `x-tavily-access-mode: keyless` 头走 keyless 匿名额度，不配 key 即可用；配置 `TAVILY_API_KEY` 后走账号档，额度更高、结果质量更稳定。
- **Keenable**：无 key 时走其公开 MCP 端点（`api.keenable.ai/mcp`）匿名调用；配置 `KEENABLE_API_KEY` 后走 REST API（`api.keenable.ai/v1/search`），额度更高、按组织限流。
- **Firecrawl**：其 `/v2/search` 端点**无需 key** 即可使用（官方文档明确说明，有匿名限流）；配置 `FIRECRAWL_API_KEY` 后可提高限额。支持 `tbs` 时间过滤（`qdr:h/d/w/m/y` 与自定义日期区间）。

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

- `web.searchProvider` 未设置，或仍是 DSH 出厂默认的官方搜索 `deepseek-official` 时，自动切换为本插件；
- 如果（你或别的插件）已显式选择其他 provider，本插件不抢占，只在启动日志输出 WARN 与切换用的 YAML。

正常安装（`dsh plugin add` / 插件管理器）时，插件自带的 **bundle patch**（`cordis.patch.yml`）还会在配置层显式写入 `searchProvider: ddg`；即使这层没生效（例如把插件作为普通依赖手工安装、或 profile patch 整体覆盖了 `web` 条目），上面的运行时兜底也会接管官方默认，不会再静默退回官方搜索。

需要显式声明、或从其他 provider 切过来时（`profiles/<profile>/cordis.patch.yml`）：

```yaml
# 让 harness 的 web_search 使用本插件。
# DSH 0.1.2+ 的 patch 是"整段覆盖 config"而不是深度合并：
# 已有 web 条目里的字段（如 fetchProvider）必须在这里一并重述，否则会被抹掉。
- id: web
  config:
    searchProvider: ddg
    fetchProvider: http
```

- `searchProvider: ddg` —— `ddg` 是**本插件注册的 provider id（固定值）**，不是"使用 DuckDuckGo 引擎"的意思；具体用哪个引擎由设置页的 `provider` 字段决定（可填 `bing`/`baidu`/`auto` 等）。
- `fetchProvider: http` —— 官方网页抓取（web-fetch-http），请保留；漏掉会导致网页抓取失效或重复注册。
- 想改回官方搜索：在插件管理器里停用本插件条目即可。

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
- **API keys**：为 Exa / Tavily / Keenable / Firecrawl / Parallel / Perplexity / DeepSeek / SerpBase / You.com 填写 key（密码框，保存后只显示"已配置"；Exa / Tavily / Keenable / Firecrawl / Parallel 不填也可免 key 使用）
  - **推荐**：付费引擎 key 建议写入 harness 凭据中心 `~/.dsh/.credentials.yaml`（如 `DEEPSEEK_API_KEY: sk-...`，与官方 LLM provider 一致，一处管理所有 key）。插件读取优先级：凭据中心 > 设置页 > 环境变量，设置页填的 key 仅作为遗留兼容。
- **Test engine**：直测当前引擎可用性（不走回退链，付费引擎无 key 会明确报错）
- **Use Bing default**：把当前搜索引擎切回稳定的免费 Bing；`Discard` 只撤销尚未保存的编辑
- **Platform search**：勾选启用 GitHub / V2EX / Bilibili 平台搜索（`platform_search` 工具按此过滤）
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

设置页有三个新块（都会保存进条目 config）：

- **全局启用的搜索引擎**：取消勾选后，该引擎会从普通 `web_search` 回退链、Auto 智能路由、`advanced_search`、`multi_search` 和引擎测试中**全局排除**；至少要保留一个引擎。
- **全局回退优先级**：用 ↑↓ 调整先后顺序。首选引擎仍先尝试；Auto 保留"语言/时间"路由规则，但自定义后同一分组内及后续回退按此顺序。被禁用的引擎保留在列表里（标记「已禁用」）但不执行；「恢复默认顺序」一键还原。
- **搜索引擎下拉里的 `Multi Search`**：选中后 `web_search` 会并发查询路由/优先级前 3 个已启用引擎，URL 去重合并、跨源命中的结果排前面。注意并发会成倍消耗额度；Multi 失败时会自动退回普通单引擎回退链并在结果里注明。

#### 配置文件

DSH 0.1.7-rc.1 起，配置跟随 profile 的插件条目保存：设置页与 `/free-search-engine` 都会写入当前 profile 的 `cordis.patch.yml` 中 `web-search-free`（`dsh-free-search`）条目的 `config`。

旧版 `~/.dsh/settings.yaml` 的 `free-search:` 段**不会被 DSH 核心自动导入**（核心的 `importLegacyDocument` 只为 `ui-developer-tools` / `ui-onboarding` / `shell` 三个段提供了映射），原文件在导入其它段后会被改名为 `settings.yaml.imported`，该段的值只留在那里。插件会在启动时检测 `settings.yaml.imported`（或仍存在的 `settings.yaml`）中的 `free-search:` 段，把可识别的字段**一次性补种**进当前 profile 的条目 `config`（写一次后不再重复，可在启动日志看到 `free-search: migrated N field(s)…`）。如果你想手动处理，也可以照着 `settings.yaml.imported` 里的值在插件页行配置中填一遍。

```yaml
# profiles/<profile>/cordis.patch.yml 中该条目的 config：
provider: bing              # ddg / ddg-lite / bing / searxng / anysearch / exa / tavily / keenable / firecrawl / parallel / perplexity / serpbase / deepseek-official / you / baidu / kimi / aliyun / doubao / auto / multi
lang: zh                    # 设置页界面语言（zh / en）
bingMarket: zh-CN           # Bing 市场
region: cn-zh               # DuckDuckGo 区域（可选）
searxngInstances:           # 自定义 SearXNG 实例（可选）
  - https://your-instance.example
exaApiKey: ...              # 或通过设置页填写
tavilyApiKey: ...           # 或通过设置页填写
keenableApiKey: ...         # 或通过设置页填写
firecrawlApiKey: ...        # 或通过设置页填写
parallelApiKey: ...         # 或通过设置页填写
perplexityApiKey: ...
serpbaseApiKey: ...         # 或通过设置页填写
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

**"最近似档位"映射规则**：`≤2 天 → day`，`≤14 天 → week`，`≤90 天 → month`，否则 `year`。例如 `3d` 在 Tavily 上按 `day` 处理，`2mo` 按 `month` 处理。

**引擎链优先级**：当带 timeRange 搜索时，支持时间过滤的引擎（tavily / exa / keenable / firecrawl / parallel / searxng / ddg / ddg-lite）会排到引擎链前面，确保过滤真正生效——即使首选引擎是 bing（不支持过滤），也会先尝试支持过滤的引擎。

示例对话：*"帮我搜最近 3 天关于 DSH 的新闻"* → agent 调用 `advanced_search`，`timeRange: "3d"`。

#### 多源并发合并搜索（multi_search）

当需要对重要问题做**多源交叉验证**、避免单一引擎偏差或单源死锁时，可以让 agent 调用 `multi_search` 工具：

- **并发请求**：默认基于当前查询类型并发请求前 3 个优选引擎（或显式传入 `engines` 列表），各引擎独立解析 API Key 与容错（缺 key 引擎自动跳过，不阻断其他引擎）。
- **去重与合并**：按规范化 URL 去除结尾斜杠并合并结果，多引擎共同命中的条目优先置顶排在最前，并在结果附带 `seenIn` 命中来源清单（如 `[seen in: bing, exa]`）。
- **不可信边界与清洗**：严格遵守 `<untrusted-web-content>` 数据边界，正文 snippet 统一清洗。
- ⚠️ 注：多源并发会消耗更多 API 配额，建议在需要多角度核验时按需使用。

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

全部走公开 API，零外部依赖、无需任何 key，开箱即用。

### 本地引擎切换工具（tools/）

`tools/` 目录附带了一个本地切换小工具（零依赖）：

- **`启动搜索引擎切换器.cmd`**（Windows）——双击启动本地 Node 服务（`http://127.0.0.1:4789`）并自动打开浏览器选择页面
- **`switch-engine.html`** —— 选择页面：显示当前引擎，点选新引擎，一键写入配置
- **`server.mjs`** —— 本地服务，负责读写 `~/.dsh/profiles/web/cordis.patch.yml`
- **`switch-engine.ps1`** —— 无界面命令行版：`powershell -File tools/switch-engine.ps1 -Engine bing`

切换后重启 `dsh web` 生效。

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

- `lib/index.js`：host 端。实现 `WebSearchProvider`（`id` / `available()` / `search()`），统一引擎路由 + 自动回退（付费引擎优先，免费兜底）；解析 `timeRange`（固定档/相对值/绝对日期）并透传给各引擎；在 `web-search-free` 条目上声明可编辑配置（`.volatile()`）并自带设置页（`plugins.row.config`）；提供 `/api/dsh-free-search-settings` 读写桥 + `raw-search` 调试接口；注册 `free_search_test`、`platform_search`、`advanced_search` 工具；动态注入引擎清单到系统提示词（设置变更时自动刷新）。
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
- **Multi-Engine Support** — DuckDuckGo (HTML / Lite), Bing, AnySearch AI, SearXNG (meta-search with custom instances), Exa, Tavily, Keenable, Firecrawl, Parallel, Perplexity, SerpBase, DeepSeek Official, You.com, Baidu Qianfan, Kimi, Aliyun Bailian, and Volcano Doubao
- **Web Settings UI** — Engine switching, API key configuration (keys masked as "configured" in the UI), and a Chinese/English toggle; the entry is the component-row config (`plugins.row.config`) on the sidebar Plugins page (DSH 0.1.7-rc.1+)
- **Popup Switch Command** — Type `/free-search-engine` in the chat: a picker opens with all engines; click one to switch (equivalent to the settings page + save)
- **Engine Testing** — `free_search_test` for the agent to check all engines in one call; the settings UI also has a "Test engine" button that tests the selected engine directly (no fallback chain; paid engines without a key report an explicit error)
- **Global engine enable/disable & fallback priority** — uncheck engines you never want (applies everywhere: web_search fallback, Auto routing, advanced_search, multi_search, engine tests) and reorder the global fallback chain with ↑↓ (one-click reset)
- **Multi mode** — pick `Multi Search` as the engine: web_search queries the top 3 enabled engines concurrently, merges/deduplicates URLs and prioritizes cross-source hits (costs more quota; a failed multi run automatically falls back to the single-engine chain)
- **Unified Engine Fallback** — Any engine failure (paid or free, missing key, 401, rate limit, network error) automatically tries the next engine: the configured engine first, then other engines (exa/tavily/keenable/firecrawl/parallel are tried even without a key because they have built-in keyless quota), then the remaining free engines (Bing/AnySearch etc.) — with a note attached to the results naming the engine that actually served them (e.g. `Note: perplexity unavailable or failed, using exa.`). Search never fails outright.
- **Time Filtering** — The `advanced_search` tool supports `timeRange`: fixed tiers, custom relative values, or an absolute date (details below)
- **System Prompt Injection** — The agent is aware of the currently active engine and which engines require API keys; it is also told that all search output is **untrusted external data** and must never be executed as instructions
- **Prompt-Injection Guard (untrusted-data boundary)** — Web-derived text from the plugin's own tools (`advanced_search` / `platform_search` / `free_search_test`) is wrapped in an explicit `<untrusted-web-content>` boundary (look-alike tags inside the text are stripped to prevent early closure); the core `web_search` / `web_fetch` tools carry DSH core's own notice (`External web content follows...`); every snippet is cleaned and capped at 300 characters
- **Version + Update Check** — The settings card shows the current version (v0.4.17), and a "Check update" button queries the npm registry to compare against the latest release, prompting a one-click jump when a newer version exists
- **Result Caching** — Identical queries (same engine / time-filter args) hit an LRU cache (50 entries) for up to 5 minutes, protecting free engines from rate-limiting and saving paid quota; the TTL is configurable from 0-5 minutes in the settings UI (0 disables caching)
- **Visual Badges** — Free engines feature a green `FREE` badge, while paid engines show an orange `API KEY` badge in the settings UI
- **Webpage Fetching (`web_fetch`)** — Allows the agent to read full webpage contents (official `dsh-web-fetch-http` provider, pure JS, zero extra dependencies)
- **Platform Search (`platform_search`)** — Search GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / Wikipedia / npm (public APIs, zero extra dependencies)
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
| `exa` | Exa | Free | **Usable without a key** (anonymous MCP); configure a key for higher quota |
| `tavily` | Tavily | Free | **Usable without a key** (keyless anonymous); configure a key for higher quota |
| `keenable` | Keenable | Free | **Usable without a key** (anonymous MCP); configure a key for higher quota |
| `firecrawl` | Firecrawl | Free | **Usable without a key** (official keyless anonymous quota); configure a key for higher limits |
| `parallel` | Parallel | Free | **Works without a key** (official MCP anonymous quota); a key raises limits and enables precise time filtering |
| `perplexity` | Perplexity | Paid | Requires `PERPLEXITY_API_KEY` |
| `serpbase` | SerpBase | Paid | Requires `SERPBASE_API_KEY` (serpbase.dev, 100 free queries on signup) |
| `deepseek-official` | DeepSeek Official | Paid | Requires `DEEPSEEK_API_KEY` |
| `you` | You.com | Paid | Requires `YOUCOM_API_KEY` (you.com/platform/api-keys, free tier on signup) |
| `baidu` | Baidu Qianfan AI Search | Quota | Requires `BAIDU_API_KEY` (Qianfan AI Search, 50 free calls/day then pay-as-you-go); Chinese web-wide, supports time filtering |
| `kimi` | Kimi (Moonshot) Web Search | Paid | Requires `MOONSHOT_API_KEY` (basic ~¥0.01/call); returns Chinese results with body chunks |
| `aliyun` | Aliyun Bailian EnhancedSearch | Paid | Requires `DASHSCOPE_API_KEY` (MCP search_pro, ~¥0.03/call, 200 free calls for new users); Chinese web-wide with source hostnames |
| `doubao` | Volcano Web Search (Doubao) | Free quota | Requires `DOUBAO_SEARCH_API_KEY` (open it in the Web Search console; **500 free queries/month**, pay-as-you-go beyond); strong for fresh Chinese content, supports time/site filters, returns long summaries |

- **Default engine is `bing`** (free and most stable), ready to use out of the box after installation.
- **Auto-failover**: any engine failure (rate-limited free engine, or missing/invalid paid key, network error) automatically tries the next engine — the configured engine first, then other engines (exa/tavily/keenable/firecrawl/parallel are tried even without a key because they have built-in keyless quota), then the remaining free engines (Bing/AnySearch etc.) — with a note attached to the results naming the engine that actually served them (e.g. `Note: perplexity unavailable or failed, using exa.`). Search never fails outright because of engine issues.
- **Official Links in Settings**: Free engines display "Visit Website →", while paid engines display "Get API Key →" (opens in a new tab):
  - Exa: <https://dashboard.exa.ai/api-keys>
  - Tavily: <https://app.tavily.com/home>
  - Keenable: <https://keenable.ai/login>
  - Parallel: <https://platform.parallel.ai>
  - Perplexity: <https://www.perplexity.ai/settings/api>
  - SerpBase: <https://serpbase.dev>
  - DeepSeek: <https://platform.deepseek.com/api_keys>
  - Doubao / Volcano Web Search: <https://console.volcengine.com/search-infinity/web-search>
  - You.com: <https://you.com/platform/api-keys>

#### Why are some engines free?

- **AnySearch**: its `v1/search` REST endpoint provides anonymous public search quota without registration or an API key. Quota is rate-limited (fine for daily queries), but as one of the free engines with mutual fallback it stays reliable.
- **Exa**: its public MCP endpoint (`mcp.exa.ai/mcp`) supports anonymous requests, so it works without a key; configuring `EXA_API_KEY` grants a higher usage quota.
- **Tavily**: offers keyless anonymous quota via the `x-tavily-access-mode: keyless` header — it works without a key; configuring `TAVILY_API_KEY` switches to the account tier for higher quota and more stable results.
- **Keenable**: without a key it is called via its public MCP endpoint (`api.keenable.ai/mcp`); configuring `KEENABLE_API_KEY` switches to the REST API (`api.keenable.ai/v1/search`) for higher quota and organization-scoped rate limits.
- **Firecrawl**: its `/v2/search` endpoint works **without a key** out of the box (the official docs state "No API key needed to get started", with anonymous rate limits); configuring `FIRECRAWL_API_KEY` raises the limits. Supports `tbs` time filtering (`qdr:h/d/w/m/y` and custom date ranges).

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

The plugin **takes over search automatically** once loaded:

- When `web.searchProvider` is unset, or still the shipped default `deepseek-official`, it switches to this plugin;
- If you (or another plugin) explicitly selected a different provider, it does not steal it — it only logs a WARN with a copy-pasteable YAML snippet.

With a normal install (`dsh plugin add` / plugin manager) the bundled **bundle patch** (`cordis.patch.yml`) additionally writes `searchProvider: ddg` into the config layer. Even if that layer does not apply (e.g. the plugin was added as a plain dependency, or a profile patch replaced the whole `web` entry), the runtime fallback above still takes over from the official default — search no longer silently falls back to the official provider.

To declare it explicitly, or to switch over from another provider (`profiles/<profile>/cordis.patch.yml`):

```yaml
# Route the harness web_search through this plugin.
# Since DSH 0.1.2 a patch REPLACES the whole entry config (no deep merge):
# restate any existing web.* fields (e.g. fetchProvider) or they are dropped.
- id: web
  config:
    searchProvider: ddg
    fetchProvider: http
```

- `searchProvider: ddg` — `ddg` is this plugin's **fixed provider id**, not "use the DuckDuckGo engine". The engine is chosen by the `provider` field in the settings page (`bing` / `baidu` / `auto` / …).
- `fetchProvider: http` — the official web-fetch provider; keep it, or page fetching breaks or double-registers.
- To go back to official search: disable this plugin's entry in the plugin manager.

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
- **API keys**: Enter keys for Exa / Tavily / Keenable / Firecrawl / Parallel / Perplexity / DeepSeek (password fields; displayed as "configured" once saved; Exa / Tavily / Keenable / Firecrawl / Parallel work without a key too).
  - **Recommended**: store paid-engine keys in the harness credential center `~/.dsh/.credentials.yaml` (e.g. `DEEPSEEK_API_KEY: sk-...`, same as the official LLM providers — one place for all keys). Resolution order: credentials center > settings page > environment variable; the settings-page fields remain for backward compatibility.
- **Test engine**: Tests the selected engine directly (no fallback chain; paid engines without a key report an explicit error).
- **Use Bing default**: stage a switch back to the stable free Bing engine; `Discard` only cancels unsaved edits
- **Platform search**: check platforms (GitHub / V2EX / Bilibili / Reddit / HN / Stack Overflow / Wikipedia / npm) to enable them for the `platform_search` tool (disabled platforms are skipped).
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

The settings page has three new blocks (all saved into the entry config):

- **Globally enabled engines**: unchecking an engine excludes it everywhere — the web_search fallback chain, Auto routing, `advanced_search`, `multi_search` and engine tests. At least one engine must remain enabled.
- **Global fallback priority**: use ↑↓ to reorder. The preferred engine is still tried first; Auto keeps its language/time routing, while a customized order governs engines inside a route group and the remaining fallback chain. Disabled engines stay in the list (marked "disabled") but are skipped; "Reset default order" restores the defaults.
- **`Multi Search` in the engine dropdown**: web_search then queries the top 3 enabled routed/prioritized engines concurrently, merges/deduplicates URLs and prioritizes cross-source hits. This multiplies quota usage; if a multi run fails it automatically falls back to the single-engine chain and says so in the result note.

#### Configuration File

Since DSH 0.1.7-rc.1 the configuration is stored with the profile's plugin entry: the settings page and `/free-search-engine` both write the `config` of the `web-search-free` (`dsh-free-search`) entry in the active profile's `cordis.patch.yml`.

The old `free-search:` section of `~/.dsh/settings.yaml` is **not** imported by the DSH core (`importLegacyDocument` only maps `ui-developer-tools` / `ui-onboarding` / `shell`); the file is renamed to `settings.yaml.imported` after the other sections are imported, and the section's values stay there. The plugin detects that section in `settings.yaml.imported` (or in a still-present `settings.yaml`) at startup and seeds the recognized fields into this entry's `config` **once** (watch for `free-search: migrated N field(s)…` in the startup log). You can also migrate manually by copying the values from `settings.yaml.imported` into the plugin row config.

```yaml
# config of that entry in profiles/<profile>/cordis.patch.yml:
provider: bing              # ddg / ddg-lite / bing / searxng / anysearch / exa / tavily / keenable / firecrawl / parallel / perplexity / serpbase / deepseek-official / you / baidu / kimi / aliyun / doubao / auto / multi
lang: zh                    # settings UI language (zh / en)
bingMarket: zh-CN           # Bing market
region: cn-zh               # DuckDuckGo region (optional)
searxngInstances:           # Custom SearXNG instances (optional)
  - https://your-instance.example
exaApiKey: ...              # Or configure via the web settings UI
tavilyApiKey: ...           # Or configure via the web settings UI
keenableApiKey: ...         # Or configure via the web settings UI
firecrawlApiKey: ...        # Or configure via the web settings UI
parallelApiKey: ...         # Or configure via the web settings UI
perplexityApiKey: ...
serpbaseApiKey: ...         # Or configure via the web settings UI
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

**Nearest-tier mapping rule**: `≤2 days → day`, `≤14 days → week`, `≤90 days → month`, otherwise `year`. For example, `3d` becomes `day` on Tavily, and `2mo` becomes `month`.

**Engine-chain priority**: when a `timeRange` is present, engines that support time filtering (tavily / exa / keenable / firecrawl / parallel / searxng / ddg / ddg-lite) are moved to the front of the fallback chain, so the filter actually takes effect — even if the preferred engine is bing (which does not support filtering), a filtering-capable engine is tried first.

Example: *"Find DSH news from the last 3 days"* → agent calls `advanced_search` with `timeRange: "3d"`.

#### Multi-Engine Concurrent Search (`multi_search`)

When you need **cross-source verification** to prevent biases or fail-safes from a single engine, the agent can call `multi_search`:

- **Concurrent Execution**: Defaults to querying the top 3 recommended engines for the query type (or an explicit list passed via `engines`). Each engine independently resolves API keys and handles errors (missing keys are skipped without failing the batch).
- **Deduplication & Merge**: Normalizes URLs and ranks items by the number of engines that found them (`seenIn` counts), with cross-hit results placed at the top.
- **Untrusted Boundary**: Enforces the `<untrusted-web-content>` safety wrapper and trims snippets.
- ⚠️ Note: Running multiple engines in parallel consumes more search quota; use on demand when high source diversity is needed.

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

All platform searches rely on public endpoints with zero external dependencies and no API keys — they work out of the box.

### Local Engine Switcher (`tools/`)

The `tools/` directory includes a lightweight, zero-dependency switcher:

- **`启动搜索引擎切换器.cmd`** (Windows) — Double-click to launch a local Node server (`http://127.0.0.1:4789`) and automatically open the engine selector page in your browser.
- **`switch-engine.html`** — The selector UI: displays current engine status and allows one-click switching.
- **`server.mjs`** — The local backend service responsible for reading/writing `~/.dsh/profiles/web/cordis.patch.yml`.
- **`switch-engine.ps1`** — Headless PowerShell script: `powershell -File tools/switch-engine.ps1 -Engine bing`.

Restart `dsh web` after switching to apply changes.

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

- `lib/index.js`: Host side. Implements `WebSearchProvider` (`id` / `available()` / `search()`), unified engine routing + auto-fallback (paid engines first, free as fallback); parses `timeRange` (fixed tiers / relative values / absolute dates) and forwards it to each engine; declares its editable config as volatile fields on the `web-search-free` composition entry and ships its own settings page (`plugins.row.config`); provides the `/api/dsh-free-search-settings` read/write bridge + `raw-search` debug endpoint; registers the `free_search_test`, `platform_search`, and `advanced_search` tools; dynamically injects the engine list into system prompts (auto-refreshes on settings change).
- `lib/client.js`: Browser side. React configuration card (engine select, key inputs, connectivity test, and Chinese/English toggle), mounted into the official `plugins.row.config` component-row slot on the sidebar Plugins page; registers the `/free-search-engine` popup switch command (`commandUi` popupSelect, the same mechanism as `/model`).
- `cordis.patch.yml`: Plugin loader configuration.

### License

MIT

## safeSearch 安全搜索过滤

- 全新配置项 `safeSearch`：`off`（引擎默认，不加参数）/ `moderate` / `strict`
- 作用于 Bing（adlt）、DuckDuckGo HTML（adlt）、DuckDuckGo Lite（adlt）
- 默认 `off`：不额外过滤，保持引擎自身默认行为；需要时在「设置 > 插件 > Free Search」切换
