# 引擎额度分层与默认池设计（提案）

本提案讨论三件事，都源自同一个问题：README 与设置页把引擎按「免费 / 付费」二分，但这个二分不足以决定**谁该进默认池**。实际约束是额度模型——有没有免费量、有多少、用超了怎么算。

先给事实，再给建议，最后列出想请维护者定的三个点。

## 1. 额度事实

按各provider 控制台与本仓库 README 既有记载整理。凡是本仓库已有明确数字的，沿用原数字。

| 引擎 | 免费额度 | 超出后 | README 现有标注 |
|---|---|---|---|
| `bing` / `ddg` / `ddg-lite` / `searxng` / `anysearch` | 无限（免 key） | — | 免费 |
| `exa` / `tavily` / `keenable` / `firecrawl` / `parallel` | 匿名额度，配 key 提额 | 按量 | 免费 |
| `baidu` | 每日 50 次 | 按量后付费 | 额度 |
| `aliyun` | 新用户 200 次包 | 约 ￥0.03/次 | 付费 |
| `doubao` | 每月 500 次 | 按量付费 | 免费额度 |
| `zhihu_global` / `zhihu_site` | 每日 5,000 次试用额度 | 试用结束需另行开通 | **付费** |
| `kimi` | **无免费额度** | 约 ￥0.01/次 | 付费 |
| `serpbase` | 注册送 100 次 | 按量 | 付费 |
| `serply` | 新账户 30 天 2,500 次 | 按量 | 付费 |
| `you` | 注册送额度 | 按量 | 付费 |
| `openai` / `gemini` / `claude` | 无（按次计费） | 按次 | 按次计费 |

两处与现状不一致，值得改：

- **`zhihu_global` / `zhihu_site` 标为「付费」**。实测控制台为每日 5,000 次试用额度，额度远比中文池其它成员宽裕（`baidu` 50/天、`doubao` 500/月、`aliyun` 一次性 200 次包）。标「付费」会让人误以为按次扣费而不敢用。
- **`kimi` 的「付费」标注是对的，但它现在出现在文档给出的中文池建议里**。无免费额度 + 进默认池 = 每次中文查询都在产生费用，这两件事不该同时成立。

## 2. 建议：按额度分层，而不是按「免费/付费」二分

```
① 无限免 key        bing · ddg · ddg-lite · searxng · anysearch
② 匿名额度          exa · tavily · keenable · firecrawl · parallel
③ 免费额度（中文）   zhihu_global · zhihu_site · doubao · aliyun · baidu
④ 付费·质量升级      kimi
⑤ 按次计费·显式专用  openai · gemini · claude
```

默认池按「③ 打主力 + ① 打底」组，② 补英文侧：

```
zhPool: bing · baidu · doubao · aliyun · anysearch · zhihu_global · zhihu_site
enPool: bing · exa · tavily · keenable
```

`kimi` 不进任何池。它无免费额度，但返回带正文 chunks 的中文结果，质量确实高于常规引擎——所以它的定位是**质量升级项**：需要高质量中文长答案或更深信源时显式指定，而不是在常规查询里烧额度，也不是等池内全挂才接棒。`config.escalationEngines` 正是为这个语义准备的字段，本提案建议把它接进系统提示词，让 agent 知道何时该主动升级。

## 3. 关于 AIHOT：它是信源，不是搜索引擎

AIHOT 不在 `ALL_ENGINES` 里，也不该在：它不接收任意 query、不返回 `url / title / snippet` 形态，塞进 `zhPool` 会被 `normalizeLanguagePool` 直接过滤。

它的实际形态是高信噪比的**已加工信源**：每天从一批信源收料，先由模型筛一遍，再独立打两轮分，挑出值得看的写成中文标题与摘要，并把不同来源说的同一件事聚成一个事件、按讨论热度排序。

对这类信源，合适的位置是消费侧的提示词引导，而不是检索池：

- AI 行业动态、模型发布、「最近 AI 圈发生了什么」→ 引导 agent 用 `aihot_*` 通道
- 其它问题 → 常规 `web_search` / `platform_search`

## 想请维护者定的三点

1. **zhihu 两个引擎的 README 标注**是否改为「免费额度（每日 5,000 次试用）」？现在写「付费」与实测不符。
2. **默认池**是否采用上面这组（zh 七项含知乎、en 四项）？还是维持 `#58` 里的 `bing/baidu/aliyun/anysearch` 与 `bing/exa/tavily`，把这份分层只写进文档？
3. **`escalationEngines` 接进提示词**这个改动，放在本仓库合适吗？它在 v0.7.5 之前只是 `Config` 里声明、运行时无人读取的字段（`#58` 的评审要求把它从那个 PR 里移出去）；**v0.8.0（PR #59）起已由 `research.js` 读取并作为补搜轮引擎使用**。

不涉及密钥与私有配置，本提案只讨论公开的额度模型与池成员的取舍。
