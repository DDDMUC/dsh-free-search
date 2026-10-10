window.__ModuleLoader__.load({
  id: "dsh-free-search",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    let react = require("react");
    let react_jsx_runtime = require("react/jsx-runtime");

    //#region css
    const css = [
      ".dshfs-card{font-family:-apple-system, \"SF Pro Text\", \"PingFang SC\", \"Segoe UI\", system-ui, sans-serif;border:1px solid rgba(0,0,0,.06);background:rgba(255,255,255,.72);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border-radius:14px;min-width:0;list-style:none;transition:all 180ms cubic-bezier(.4,0,.2,1);overflow:hidden;margin-bottom:12px;box-shadow:0 1px 2px rgba(0,0,0,.04), 0 10px 30px rgba(0,0,0,.06);color:#1d1d1f}",
      "@media (prefers-color-scheme: dark){.dshfs-card{background:rgba(30,30,32,.7);border:1px solid rgba(255,255,255,.08);color:#f5f5f7;box-shadow:0 1px 2px rgba(0,0,0,.2), 0 10px 30px rgba(0,0,0,.3)}}",
      ".dshfs-cardOpen{}",
      ".dshfs-header{width:100%;color:inherit;cursor:pointer;text-align:left;font:inherit;background:0 0;border:0;align-items:center;gap:12px;padding:16px 20px;display:flex;transition:background 180ms cubic-bezier(.4,0,.2,1)}",
      ".dshfs-header:hover:not(:disabled){background:rgba(0,0,0,.03)}",
      "@media (prefers-color-scheme: dark){.dshfs-header:hover:not(:disabled){background:rgba(255,255,255,.04)}}",
      ".dshfs-pageMode>.dshfs-header{cursor:default}",
      ".dshfs-pageMode>.dshfs-header:hover{background:0 0}",
      ".dshfs-pageMode .dshfs-chevron{display:none}",
      ".dshfs-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex;overflow:hidden}",
      ".dshfs-name{color:inherit;white-space:nowrap;text-overflow:ellipsis;font-weight:600;font-size:15px;overflow:hidden}",
      ".dshfs-description{color:#6e6e73;white-space:nowrap;text-overflow:ellipsis;font-size:13px;overflow:hidden}",
      "@media (prefers-color-scheme: dark){.dshfs-description{color:#a1a1a6}}",
      ".dshfs-pending{color:#e5a720;white-space:nowrap;flex:none;font-size:12px;font-weight:500}",
      ".dshfs-chevron{color:#6e6e73;flex:none;font-size:14px;transition:transform 180ms cubic-bezier(.4,0,.2,1)}",
      ".dshfs-chevronOpen{transform:rotate(180deg)}",
      "@media (prefers-color-scheme: dark){.dshfs-chevron{color:#a1a1a6}}",
      "@keyframes dshfsFadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}",
      ".dshfs-body{flex-direction:column;gap:20px;padding:0 20px 20px;display:flex;animation:dshfsFadeIn 240ms cubic-bezier(.4,0,.2,1) forwards}",
      "@media (prefers-reduced-motion: reduce){.dshfs-body{animation:none}}",
      ".dshfs-footer{justify-content:space-between;align-items:center;gap:12px;display:flex;flex-wrap:wrap;padding-top:4px}",
      ".dshfs-footerLeft{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}",
      ".dshfs-footerRight{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
      ".dshfs-failed{color:#ff3b30;font-size:13px}",
      "@media (prefers-color-scheme: dark){.dshfs-failed{color:#ff453a}}",
      ".dshfs-testOk{color:#34c759;font-size:13px;line-height:1.5}",
      "@media (prefers-color-scheme: dark){.dshfs-testOk{color:#30d158}}",
      ".dshfs-resultRow{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0;margin-top:-4px}",
      ".dshfs-field{flex-direction:column;gap:8px;min-width:0;display:flex}",
      ".dshfs-label{color:inherit;font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px}",
      ".dshfs-select, .dshfs-input{border:1px solid rgba(0,0,0,.1);font:inherit;font-variant-numeric:tabular-nums;color:inherit;background:rgba(0,0,0,.03);border-radius:10px;padding:0 12px;height:38px;font-size:14px;transition:all 160ms cubic-bezier(.4,0,.2,1);width:100%;box-sizing:border-box}",
      "@media (prefers-color-scheme: dark){.dshfs-select, .dshfs-input{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05)}}",
      ".dshfs-select{appearance:none;background-image:url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236e6e73' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}",
      "@media (prefers-color-scheme: dark){.dshfs-select{background-image:url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23a1a1a6' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")}}",
      ".dshfs-select:hover:not(:disabled), .dshfs-input:hover:not(:disabled){border-color:rgba(0,0,0,.2);background:rgba(0,0,0,.05)}",
      "@media (prefers-color-scheme: dark){.dshfs-select:hover:not(:disabled), .dshfs-input:hover:not(:disabled){border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.08)}}",
      ".dshfs-select:focus-visible, .dshfs-input:focus-visible{outline:none;border-color:#0071e3;box-shadow:0 0 0 3px rgba(0,113,227,.25);background:#ffffff}",
      "@media (prefers-color-scheme: dark){.dshfs-select:focus-visible, .dshfs-input:focus-visible{border-color:#0a84ff;box-shadow:0 0 0 3px rgba(10,132,255,.25);background:#1c1c1e}}",
      ".dshfs-input:disabled, .dshfs-select:disabled{opacity:.5;cursor:default}",
      ".dshfs-select{color-scheme:light dark}",
      ".dshfs-select option, .dshfs-select optgroup{background-color:#ffffff;color:#1d1d1f}",
      "@media (prefers-color-scheme: dark){.dshfs-select{color-scheme:dark}.dshfs-select option, .dshfs-select optgroup{background-color:#1e1f24;color:#f5f5f7}}",
      ".dshfs-ttl{width:100px}",
      ".dshfs-fieldRow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}",
      ".dshfs-keyStorage{width:auto;min-width:200px}",
      ".dshfs-hint{color:#6e6e73;margin:0;font-size:13px;line-height:1.4}",
      "@media (prefers-color-scheme: dark){.dshfs-hint{color:#a1a1a6}}",
      ".dshfs-platforms{display:flex;gap:12px 16px;flex-wrap:wrap}",
      ".dshfs-platform{display:flex;align-items:center;gap:6px;color:inherit;font-size:14px;cursor:pointer}",
      ".dshfs-platform input{accent-color:#0071e3;width:16px;height:16px}",
      ".dshfs-priorityList{display:flex;flex-direction:column;gap:6px}",
      ".dshfs-priorityRow{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid rgba(0,0,0,.08);border-radius:10px;background:rgba(0,0,0,.02)}",
      "@media (prefers-color-scheme: dark){.dshfs-priorityRow{border-color:rgba(255,255,255,.09);background:rgba(255,255,255,.035)}}",
      ".dshfs-priorityRowDisabled{opacity:.58}",
      ".dshfs-priorityIndex{width:26px;flex:none;color:#6e6e73;font-size:12px;font-variant-numeric:tabular-nums;text-align:right}",
      "@media (prefers-color-scheme: dark){.dshfs-priorityIndex{color:#a1a1a6}}",
      ".dshfs-priorityName{flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".dshfs-priorityActions{display:flex;align-items:center;gap:4px;flex:none}",
      ".dshfs-priorityBtn{width:30px;height:28px;padding:0;font-size:14px}",
      ".dshfs-priorityHandle{cursor:grab;color:#8e8e93;font-size:16px;line-height:1;padding:0 2px;user-select:none;flex:none}",
      "@media (prefers-color-scheme: dark){.dshfs-priorityHandle{color:#98989d}}",
        ".dshfs-priorityHandle:active{cursor:grabbing}",
        ".dshfs-priorityKey{flex:1;min-width:110px;max-width:200px;height:26px;padding:0 8px;font-size:12px;border:1px solid rgba(0,0,0,.12);border-radius:8px;background:transparent;color:inherit}",
        "@media (prefers-color-scheme: dark){.dshfs-priorityKey{border-color:rgba(255,255,255,.14)}}",
        ".dshfs-priorityKey::placeholder{color:#8e8e93}",
        ".dshfs-keyStatus{flex:none;width:8px;height:8px;border-radius:50%;display:inline-block}",
        ".dshfs-keyStatus-ok{background:#34c759}",
        ".dshfs-keyStatus-miss{background:#ff9500}",
        ".dshfs-keyStatus-opt{background:#c7c7cc}",
        "@media (prefers-color-scheme: dark){.dshfs-keyStatus-opt{background:#48484a}}",
      ".dshfs-priorityRow[draggable='true']{cursor:grab}",
      ".dshfs-priorityRowDragging{opacity:.45;border-style:dashed}",
      "@media (prefers-color-scheme: dark){.dshfs-platform input{accent-color:#0a84ff}}",
      ".dshfs-link{color:#0071e3;font-size:13px;text-decoration:none;align-self:flex-start;padding:2px 0;font-weight:500}",
      ".dshfs-link:hover{text-decoration:underline}",
      "@media (prefers-color-scheme: dark){.dshfs-link{color:#0a84ff}}",
      ".dshfs-btn{font:inherit;cursor:pointer;border-radius:10px;padding:0 14px;height:32px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;transition:all 180ms cubic-bezier(.4,0,.2,1);border:1px solid rgba(0,0,0,.1);background:transparent;color:inherit}",
      "@media (prefers-color-scheme: dark){.dshfs-btn{border-color:rgba(255,255,255,.15)}}",
      ".dshfs-btn:hover:not(:disabled){background:rgba(0,0,0,.04)}",
      "@media (prefers-color-scheme: dark){.dshfs-btn:hover:not(:disabled){background:rgba(255,255,255,.06)}}",
      ".dshfs-btn:active:not(:disabled){transform:scale(0.98)}",
      ".dshfs-btn:disabled{opacity:.5;cursor:default}",
      ".dshfs-save{border:none;background:#0071e3;color:#ffffff;box-shadow:0 1px 2px rgba(0,0,0,.1)}",
      ".dshfs-save:hover:not(:disabled){background:#0077ed;transform:translateY(-1px);box-shadow:0 2px 4px rgba(0,0,0,.15)}",
      ".dshfs-save:active:not(:disabled){transform:scale(0.98)}",
      "@media (prefers-color-scheme: dark){.dshfs-save{background:#0a84ff;color:#ffffff}.dshfs-save:hover:not(:disabled){background:#1e8eff}}",
      ".dshfs-upgrade{border:1px solid rgba(52,199,89,.4);background:rgba(52,199,89,.15);color:#248a3d}",
      "@media (prefers-color-scheme: dark){.dshfs-upgrade{color:#30d158}}",
      ".dshfs-upgrade:hover:not(:disabled){background:rgba(52,199,89,.25)}",
      ".dshfs-badge{background:rgba(0,0,0,.05);color:#1d1d1f;white-space:nowrap;border-radius:999px;flex:none;padding:2px 8px;font-size:11px;font-weight:600;letter-spacing:0.3px}",
      "@media (prefers-color-scheme: dark){.dshfs-badge{background:rgba(255,255,255,.1);color:#f5f5f7}}",
      ".dshfs-badgeAuto{background:rgba(175,82,222,.15);color:#af52de;border:1px solid rgba(175,82,222,.2)}",
      "@media (prefers-color-scheme: dark){.dshfs-badgeAuto{background:rgba(191,90,242,.15);color:#bf5af2;border-color:rgba(191,90,242,.2)}}",
      ".dshfs-badgeMulti{background:rgba(0,122,255,.13);color:#007aff;border:1px solid rgba(0,122,255,.2)}",
      "@media (prefers-color-scheme: dark){.dshfs-badgeMulti{background:rgba(10,132,255,.15);color:#0a84ff;border-color:rgba(10,132,255,.25)}}",
      ".dshfs-badgeFree{background:rgba(52,199,89,.15);color:#248a3d;border:1px solid rgba(52,199,89,.2)}",
      "@media (prefers-color-scheme: dark){.dshfs-badgeFree{background:rgba(48,209,88,.15);color:#30d158;border-color:rgba(48,209,88,.2)}}",
      ".dshfs-badgeKey{background:rgba(255,149,0,.15);color:#cc7a00;border:1px solid rgba(255,149,0,.2)}",
      "@media (prefers-color-scheme: dark){.dshfs-badgeKey{background:rgba(255,159,10,.15);color:#ff9f0a;border-color:rgba(255,159,10,.2)}}",
      ".dshfs-langToggle{padding:0 8px;height:24px;font-size:11px;border-radius:8px;color:#6e6e73}",
      "@media (prefers-color-scheme: dark){.dshfs-langToggle{color:#a1a1a6}}",
      ".dshfs-update{color:#cc7a00;flex:none;font-size:12px;white-space:nowrap;border:1px solid rgba(255,149,0,.3);background:rgba(255,149,0,.12);border-radius:999px;padding:2px 8px}",
      "@media (prefers-color-scheme: dark){.dshfs-update{color:#ff9f0a}}",
      ".dshfs-updateOk{color:#248a3d;flex:none;font-size:12px;white-space:nowrap;border:1px solid rgba(52,199,89,.3);background:rgba(52,199,89,.12);border-radius:999px;padding:2px 8px}",
      "@media (prefers-color-scheme: dark){.dshfs-updateOk{color:#30d158}}",
      ".dshfs-updateLine{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
      ".dshfs-updatePill{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(0,113,227,.2);background:rgba(0,113,227,.1);color:#0071e3;font:inherit;font-size:13px;font-weight:500;line-height:1;cursor:pointer;padding:6px 12px;border-radius:999px;text-decoration:none;white-space:nowrap;transition:all 180ms cubic-bezier(.4,0,.2,1)}",
      "@media (prefers-color-scheme: dark){.dshfs-updatePill{color:#0a84ff;background:rgba(10,132,255,.15);border-color:rgba(10,132,255,.25)}}",
      ".dshfs-updatePill:hover:not(:disabled){background:rgba(0,113,227,.15);border-color:rgba(0,113,227,.3)}",
      "@media (prefers-color-scheme: dark){.dshfs-updatePill:hover:not(:disabled){background:rgba(10,132,255,.2);border-color:rgba(10,132,255,.4)}}",
      ".dshfs-updatePill:disabled{opacity:.5;cursor:default}",
      ".dshfs-updateIcon{flex:none;display:block}",
      ".dshfs-version{color:#6e6e73;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}",
      "@media (prefers-color-scheme: dark){.dshfs-version{color:#a1a1a6}}"
    ].join("");
    const tagId = "dsh-free-search/card.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-free-search";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }
    //#endregion

    const BRIDGE_PREFIX = "/api/dsh-free-search-settings";
    // rc.1: the settings namespace is the profile composition entry id (the
    // `web-search-free` row declared by cordis.patch.yml), not the old `free-search`
    // section name. Keep in sync with FREE_SEARCH_NS in lib/index.js.
    const NS = "web-search-free";
    const I18N = {
      zh: {
        description: "免费搜索 —— 无需 API key（Bing / DuckDuckGo / AnySearch / Exa / Tavily / Keenable / Firecrawl / Parallel），支持 You.com（API KEY）",
        unsaved: "未保存",
        searchEngine: "搜索引擎",
        visit: "访问官网 →",
        getKey: "获取 API Key →",
        engineHint: "Multi Search 会按查询语言并发对应语言池的全部已启用引擎并合并去重（中文/英文池可在下方编辑，每池最低 2 个引擎）；Auto 根据查询语言及时间过滤自动优选单个引擎。Bing 是稳定的免费引擎。API KEY 引擎需在下方填写凭据。",
        apiKeys: "API 密钥",
        anysearchPh: (c) => c ? "AnySearch API 密钥（已配置）" : "AnySearch API 密钥（可选，不填免费匿名，填了提额）",
        exaPh: (c) => c ? "Exa API 密钥（已配置）" : "Exa API 密钥（可选，不填也可免费使用）",
        tavilyPh: (c) => c ? "Tavily API 密钥（已配置）" : "Tavily API 密钥（可选，不填也可免费使用）",
        keenablePh: (c) => c ? "Keenable API 密钥（已配置）" : "Keenable API 密钥（可选，不填也可免费使用）",
        firecrawlPh: (c) => c ? "Firecrawl API 密钥（已配置）" : "Firecrawl API 密钥（可选，不填也可免费使用）",
        parallelPh: (c) => c ? "Parallel API 密钥（已配置）" : "Parallel API 密钥（可选，不填走 MCP 免 key）",
        perplexityPh: (c) => c ? "Perplexity API 密钥（已配置）" : "Perplexity API 密钥（pplx-...）",
        deepseekPh: (c) => c ? "DeepSeek API 密钥（已配置）" : "DeepSeek API 密钥（sk-...）",
        serpbasePh: (c) => c ? "SerpBase API 密钥（已配置）" : "SerpBase API 密钥（serpbase.dev 获取）",
        serplyPh: (c) => c ? "Serply API 密钥（已配置）" : "Serply API 密钥（serply.io 获取）",
        youcomPh: (c) => c ? "You.com API 密钥（已配置）" : "You.com API 密钥（you.com/platform/api-keys 获取）",
        baiduPh: (c) => c ? "Baidu API 密钥（已配置）" : "百度千帆 API 密钥（BAIDU_API_KEY）",
        kimiPh: (c) => c ? "Kimi API 密钥（已配置）" : "Kimi API 密钥（MOONSHOT_API_KEY）",
        aliyunPh: (c) => c ? "Aliyun API 密钥（已配置）" : "阿里云 DashScope 密钥（DASHSCOPE_API_KEY）",
        doubaoPh: (c) => c ? "豆包搜索密钥（已配置）" : "豆包搜索 / 火山联网搜索密钥（DOUBAO_SEARCH_API_KEY，每月 500 次免费）",
        openaiPh: (c) => c ? "OpenAI 密钥（已配置）" : "OpenAI 密钥（OPENAI_API_KEY，按次计费，仅显式选用）",
        geminiPh: (c) => c ? "Gemini 密钥（已配置）" : "Gemini 密钥（GEMINI_API_KEY / GOOGLE_API_KEY，按次计费，仅显式选用）",
        claudePh: (c) => c ? "Claude 密钥（已配置）" : "Anthropic 密钥（ANTHROPIC_API_KEY，按次计费，仅显式选用）",
        zhihuPh: (c) => c ? "知乎密钥（已配置）" : "知乎密钥（ZHIHU_API_KEY，知乎全网/站内共用）",
        tinyfishPh: (c) => c ? "TinyFish 密钥（已配置）" : "TinyFish 密钥（TINYFISH_API_KEY，免费 12000 次/天）",
        jinaPh: (c) => c ? "Jina 密钥（已配置）" : "Jina 密钥（JINA_API_KEY）",
        billedLabel: "按次计费",
        billedHint: "模型内置搜索（OpenAI/Gemini/Claude）：每次调用按量计费，仅在显式选中时运行，不参与自动回退。",
        keyStatusConfigured: "密钥已配置",
        keyStatusMissing: "缺少必需密钥",
        keyStatusOptional: "密钥可选（未配置也可用）",
        keysHint: "密钥读取优先级：.credentials.yaml 凭据中心 > 这里 > 环境变量。推荐把 key 写进凭据中心（与官方 LLM 一致，一处管理）。",
        keyStorage: "Key 存储位置",
        keyStorageCred: "凭据中心（推荐）",
        keyStorageSettings: "设置页（兼容）",
        keyStorageCredHint: (c) => `保存后写入 ~/.dsh/.credentials.yaml（最高优先级）。当前已配置：${["anysearch", "exa", "tavily", "keenable", "firecrawl", "parallel", "perplexity", "serpbase", "serply", "deepseek", "youcom", "baidu", "kimi", "aliyun", "doubao", "openai", "gemini", "claude"].filter((k) => c[k]).map((k) => k.toUpperCase()).join(", ") || "无"}`,
        keyStorageSettingsHint: "保存后写入当前 profile 的插件条目 config（cordis.patch.yml，优先级低于凭据中心）。",
        engineEnable: "全局启用的搜索引擎",
        engineEnableHint: "取消勾选后，该引擎会从普通 web_search 回退链、Auto 智能路由、advanced_search、multi_search 和引擎测试中全局排除。至少保留一个引擎。",
        fallbackPriority: "全局回退优先级",
        fallbackPriorityHint: "从上到下为回退顺序。首选引擎仍先尝试；Auto 保留语言/时间路由，但自定义后同一分组内及后续回退按此顺序。禁用引擎不会执行，但会保留当前位置。",
        fallbackPriorityReset: "恢复默认顺序",
        zhPoolLabel: "中文查询池",
        enPoolLabel: "英文查询池",
        languagePoolHint: "Auto 路由的起始组与 Multi 模式的并发池：按查询语言二选一，Multi 并发池内全部引擎（不再是前 3 个）。每池最低 2 个引擎、无上限；禁用/冷却/缺 key 的引擎会自动跳过。",
        poolAddFirst: "添加引擎…",
        poolRemove: "移除",
        poolReset: "恢复默认池",
        fallbackOnLabel: "回退触发条件（fallbackOn）",
        fallbackOnHint: "勾选哪些失败类别允许触发回退到下一个引擎。全部勾选＝保持现状（搜索永不直接失败）；取消某类＝遇到该类失败就停下并把该引擎的错误报出，不再换引擎。缺 key、被禁用、不支持时间过滤不算失败，始终会换引擎。",
        classQuota: "额度/预算耗尽 (quota)",
        classAuth: "鉴权失败 (auth)",
        classBotWall: "反爬拦截 (bot-wall)",
        classTransient: "超时/网络/限流 (transient)",
        classInvalidResponse: "解析失败/0 结果 (invalid-response)",
        classUnknown: "其他未知 (unknown)",
        priorityDisabled: "已禁用",
        platformSearch: "平台搜索（platform_search 工具）",
        platformHint: "为 agent 的 platform_search 工具启用平台。禁用的平台会被跳过。",
        cacheTtl: "结果缓存时长（分钟）",
        cacheTtlHint: "0 关闭缓存，最长 5 分钟。缩短可加快时效，延长可防限流、省额度。",
        unavailable: "设置不可用 —— free-search 桥接未暴露。",
        saveFailed: "保存失败",
        saveFailedDetail: (d) => `保存失败：${d}`,
        testing: "测试中…",
        testEngine: "测试引擎",
        useBing: "恢复 Bing 默认",
        discard: "撤销",
        saving: "保存中…",
        save: "保存",
        testOk: (r) => `✓ ${r.count} 条结果（引擎: ${r.engine}）${r.content ? ` — ${r.content}` : ""}${r.sample ? ` · 例如 "${r.sample.slice(0, 40)}"` : ""}`,
        testFail: (e) => `✗ ${e}`,
        toggleLang: "EN",
        checkUpdate: "检查更新",
        checkingUpdate: "检查中…",
        updateAvailable: (c, l) => `发现新版本 v${l}（当前 v${c}）`,
        updateLatest: (c) => `已是最新版本 v${c}`,
        updateCheckFailed: "检查更新失败（无法访问 npm registry）",
        updateView: "查看 →",
        hasUpdate: "有更新",
        upgrade: "升级",
        upgrading: "升级中…",
        upgradeLinkMode: "（本地开发模式，升级请用 git pull）",
        upgradeDone: (l) => `升级到 v${l} 完成，重启 dsh 后生效`,
        upgradeFailed: (m) => `升级失败：${m}`,
        safeSearchLabel: "安全搜索过滤 (adlt)",
        safeSearchOff: "关闭 —— 引擎默认（不加参数）",
        safeSearchModerate: "中等 —— Bing 默认",
        safeSearchStrict: "严格",
        safeSearchHint: "作用于 Bing（adlt）、DuckDuckGo HTML / Lite（adlt 等级）。如遇引擎自带过滤可在此调整。",
        bingMarketLabel: "Bing 市场（本地化结果）",
        bingMarketHint: "Bing 的 mkt + Accept-Language 跟随此设置。例如 ru-RU 会让西里尔查询返回俄语结果。",
        marketZhCN: "zh-CN —— 中国大陆（默认）",
        marketZhTW: "zh-TW —— 台湾",
        marketEnUS: "en-US —— 美国",
        marketEnGB: "en-GB —— 英国",
        marketRuRU: "ru-RU —— 俄罗斯",
        marketJaJP: "ja-JP —— 日本",
        marketDeDE: "de-DE —— 德国",
        marketFrFR: "fr-FR —— 法国",
        marketEsES: "es-ES —— 西班牙",
        marketKoKR: "ko-KR —— 韩国",
      },
      en: {
        description: "Free web search — no API key needed (Bing / DuckDuckGo / AnySearch / Exa / Tavily / Keenable / Firecrawl / Parallel), plus You.com (API KEY)",
        unsaved: "unsaved",
        searchEngine: "Search engine",
        visit: "Visit website →",
        getKey: "Get API Key →",
        engineHint: "Multi Search queries every enabled engine of the query's language pool concurrently and merges/deduplicates results (zh/en pools editable below, minimum 2 engines each). Auto smartly routes a single engine by query language and time filter. API KEY engines need credentials below.",
        apiKeys: "API keys",
        anysearchPh: (c) => c ? "AnySearch API key (configured)" : "AnySearch API key (optional, free anonymous without; key raises quota)",
        exaPh: (c) => c ? "Exa API key (configured)" : "Exa API key (optional, free without)",
        tavilyPh: (c) => c ? "Tavily API key (configured)" : "Tavily API key (optional, free without)",
        keenablePh: (c) => c ? "Keenable API key (configured)" : "Keenable API key (optional, free without)",
        firecrawlPh: (c) => c ? "Firecrawl API key (configured)" : "Firecrawl API key (optional, free without)",
        parallelPh: (c) => c ? "Parallel API key (configured)" : "Parallel API key (optional, free without)",
        perplexityPh: (c) => c ? "Perplexity API key (configured)" : "Perplexity API key (pplx-...)",
        deepseekPh: (c) => c ? "DeepSeek API key (configured)" : "DeepSeek API key (sk-...)",
        serpbasePh: (c) => c ? "SerpBase API key (configured)" : "SerpBase API key (from serpbase.dev)",
        serplyPh: (c) => c ? "Serply API key (configured)" : "Serply API key (from serply.io)",
        youcomPh: (c) => c ? "You.com API key (configured)" : "You.com API key (from you.com/platform/api-keys)",
        baiduPh: (c) => c ? "Baidu API key (configured)" : "Baidu Qianfan API key (BAIDU_API_KEY)",
        kimiPh: (c) => c ? "Kimi API key (configured)" : "Kimi API key (MOONSHOT_API_KEY)",
        aliyunPh: (c) => c ? "Aliyun API key (configured)" : "Aliyun DashScope API key (DASHSCOPE_API_KEY)",
        doubaoPh: (c) => c ? "Doubao search key (configured)" : "Doubao / Volcano Web Search key (DOUBAO_SEARCH_API_KEY, 500 free/month)",
        openaiPh: (c) => c ? "OpenAI key (configured)" : "OpenAI key (OPENAI_API_KEY, billed per search, explicit use only)",
        geminiPh: (c) => c ? "Gemini key (configured)" : "Gemini key (GEMINI_API_KEY / GOOGLE_API_KEY, billed per search, explicit use only)",
        claudePh: (c) => c ? "Claude key (configured)" : "Anthropic key (ANTHROPIC_API_KEY, billed per search, explicit use only)",
        zhihuPh: (c) => c ? "Zhihu key (configured)" : "Zhihu key (ZHIHU_API_KEY, shared by Zhihu web-wide/site)",
        tinyfishPh: (c) => c ? "TinyFish key (configured)" : "TinyFish key (TINYFISH_API_KEY, 12000 free/day)",
        jinaPh: (c) => c ? "Jina key (configured)" : "Jina key (JINA_API_KEY)",
        billedLabel: "Per-search billing",
        billedHint: "Model-based search (OpenAI/Gemini/Claude): billed per call, runs only when explicitly selected, never in automatic fallback.",
        keyStatusConfigured: "Key configured",
        keyStatusMissing: "Required key missing",
        keyStatusOptional: "Key optional (works without)",
        keysHint: "Key resolution: .credentials.yaml credential center > here > environment variables. Recommended: store keys in the credential center (same as official LLM providers, one place for all).",
        keyStorage: "Key storage",
        keyStorageCred: "Credential center (recommended)",
        keyStorageSettings: "Settings page (legacy)",
        keyStorageCredHint: (c) => `Saved to ~/.dsh/.credentials.yaml (highest priority). Currently configured: ${["anysearch", "exa", "tavily", "keenable", "firecrawl", "parallel", "perplexity", "serpbase", "serply", "deepseek", "youcom", "baidu", "kimi", "aliyun", "doubao", "openai", "gemini", "claude"].filter((k) => c[k]).map((k) => k.toUpperCase()).join(", ") || "none"}`,
        keyStorageSettingsHint: "Saved to the active profile plugin entry config (cordis.patch.yml; lower priority than the credential center).",
        engineEnable: "Globally enabled search engines",
        engineEnableHint: "Unchecked engines are excluded globally from web_search fallback, Auto routing, advanced_search, multi_search, and engine tests. At least one engine must remain enabled.",
        fallbackPriority: "Global fallback priority",
        fallbackPriorityHint: "Top to bottom is the fallback order. The preferred engine is still tried first. Auto keeps language/time routing, while customized priority orders engines within a route group and the remaining fallback chain. Disabled engines keep their position but are skipped.",
        fallbackPriorityReset: "Reset default order",
        zhPoolLabel: "Chinese query pool",
        enPoolLabel: "English query pool",
        languagePoolHint: "The route head for Auto and the concurrent pool for Multi: picked by query language. Multi runs every engine in the pool (no longer top 3). Each pool keeps a minimum of 2 engines, no upper limit; disabled/cooling/keyless engines are skipped automatically.",
        poolAddFirst: "Add engine…",
        poolRemove: "Remove",
        poolReset: "Reset default pool",
        fallbackOnLabel: "Fallback triggers (fallbackOn)",
        fallbackOnHint: "Choose which failure classes may trigger a fallback to the next engine. All checked = current behaviour (search never fails outright); unchecking one means such a failure stops the search and surfaces that engine's error instead of trying another engine. Missing keys, disabled engines and unsupported time filters are not failures and always advance.",
        classQuota: "Quota/budget exhausted (quota)",
        classAuth: "Auth failure (auth)",
        classBotWall: "Anti-bot block (bot-wall)",
        classTransient: "Timeout/network/rate limit (transient)",
        classInvalidResponse: "Parse failure / 0 results (invalid-response)",
        classUnknown: "Other unknown (unknown)",
        priorityDisabled: "disabled",
        platformSearch: "Platform search (platform_search tool)",
        platformHint: "Enable platforms for the agent's platform_search tool. Disabled platforms are skipped.",
        cacheTtl: "Result cache TTL (minutes)",
        cacheTtlHint: "0 disables caching, max 5 minutes. Lower = fresher results, higher = less rate-limiting / fewer credits used.",
        unavailable: "Settings unavailable — the free-search bridge is not exposed.",
        saveFailed: "save failed",
        saveFailedDetail: (d) => `save failed: ${d}`,
        testing: "Testing…",
        testEngine: "Test engine",
        useBing: "Use Bing default",
        discard: "Discard",
        saving: "Saving…",
        save: "Save",
        testOk: (r) => `✓ ${r.count} results (engine: ${r.engine})${r.content ? ` — ${r.content}` : ""}${r.sample ? ` · e.g. "${r.sample.slice(0, 40)}"` : ""}`,
        testFail: (e) => `✗ ${e}`,
        toggleLang: "中文",
        checkUpdate: "Check update",
        checkingUpdate: "Checking…",
        updateAvailable: (c, l) => `New version v${l} available (current v${c})`,
        updateLatest: (c) => `You're on the latest version v${c}`,
        updateCheckFailed: "Update check failed (cannot reach npm registry)",
        updateView: "View →",
        hasUpdate: "Update available",
        upgrade: "Upgrade",
        upgrading: "Upgrading…",
        upgradeLinkMode: "(local dev install - use git pull to update)",
        upgradeDone: (l) => `Upgraded to v${l} - restart dsh to apply`,
        upgradeFailed: (m) => `Upgrade failed: ${m}`,
        safeSearchLabel: "Safe search filter (adlt)",
        safeSearchOff: "Off - engine default (no filtering)",
        safeSearchModerate: "Moderate - Bing default",
        safeSearchStrict: "Strict",
        safeSearchHint: "Applies to bing (adlt), ddg, ddg-lite (adlt degree). If you see the engine's own filtering, adjust here.",
        bingMarketLabel: "Bing market (localized results)",
        bingMarketHint: "Bing's mkt + Accept-Language follow this. e.g. ru-RU returns Russian results for Cyrillic queries.",
        marketZhCN: "zh-CN - China (default)",
        marketZhTW: "zh-TW - Taiwan",
        marketEnUS: "en-US - United States",
        marketEnGB: "en-GB - United Kingdom",
        marketRuRU: "ru-RU - Russia",
        marketJaJP: "ja-JP - Japan",
        marketDeDE: "de-DE - Germany",
        marketFrFR: "fr-FR - France",
        marketEsES: "es-ES - Spain",
        marketKoKR: "ko-KR - Korea",
      },
    };
    const tt = (lang) => I18N[lang === "en" ? "en" : "zh"];
    // 当前插件版本（与 lib/index.js 的 PLUGIN_VERSION 保持一致；跟随上游 v0.7.5）
    const PLUGIN_VERSION = "0.8.5";
    const ENGINES = [
      { id: "auto", label: "Auto · 智能路由", badge: "AUTO", link: null },
      { id: "multi", label: "Multi Search · 多引擎", badge: "MULTI", link: null },
      { id: "ddg", label: "DuckDuckGo · HTML", badge: "FREE", link: "https://duckduckgo.com" },
      { id: "ddg-lite", label: "DuckDuckGo · Lite", badge: "FREE", link: "https://duckduckgo.com" },
      { id: "bing", label: "Bing", badge: "FREE", link: "https://www.bing.com" },
      { id: "anysearch", label: "AnySearch · AI", badge: "FREE", link: "https://anysearch.com" },
      { id: "searxng", label: "SearXNG · 元搜索", badge: "FREE", link: "https://github.com/searxng/searxng" },
      { id: "exa", label: "Exa", badge: "FREE", link: "https://dashboard.exa.ai/api-keys" },
      { id: "tavily", label: "Tavily", badge: "FREE", link: "https://app.tavily.com/home" },
      { id: "keenable", label: "Keenable", badge: "FREE", link: "https://keenable.ai/login" },
      { id: "firecrawl", label: "Firecrawl", badge: "FREE", link: "https://www.firecrawl.dev" },
      { id: "parallel", label: "Parallel", badge: "FREE", link: "https://platform.parallel.ai" },
      { id: "perplexity", label: "Perplexity", badge: "API KEY", link: "https://www.perplexity.ai/settings/api" },
      { id: "serpbase", label: "SerpBase · Google", badge: "API KEY", link: "https://serpbase.dev" },
      { id: "serply", label: "Serply · Google", badge: "API KEY", link: "https://serply.io" },
      { id: "deepseek-official", label: "DeepSeek Official", badge: "API KEY", link: "https://platform.deepseek.com/api_keys" },
      { id: "you", label: "You.com", badge: "API KEY", link: "https://you.com/platform/api-keys" },
      { id: "baidu", label: "Baidu · 百度千帆", badge: "API KEY", link: "https://console.bce.baidu.com/qianfan" },
      { id: "kimi", label: "Kimi · Moonshot", badge: "API KEY", link: "https://platform.moonshot.cn" },
      { id: "aliyun", label: "Aliyun · 百炼", badge: "API KEY", link: "https://bailian.console.aliyun.com" },
      { id: "doubao", label: "Doubao · 豆包搜索", badge: "API KEY", link: "https://console.volcengine.com/search-infinity/web-search" },
      { id: "tinyfish", label: "TinyFish", badge: "API KEY", link: "https://agent.tinyfish.ai/api-keys" },
      { id: "jina", label: "Jina · 搜索", badge: "API KEY", link: "https://jina.ai/" },
      { id: "zhihu_global", label: "Zhihu · 知乎全网", badge: "API KEY", link: "https://developer.zhihu.com" },
      { id: "zhihu_site", label: "Zhihu · 知乎站内", badge: "API KEY", link: "https://developer.zhihu.com" },
      { id: "openai", label: "OpenAI · 内置搜索", badge: "API KEY", link: "https://platform.openai.com/api-keys" },
      { id: "gemini", label: "Gemini · 内置搜索", badge: "API KEY", link: "https://aistudio.google.com/apikey" },
      { id: "claude", label: "Claude · 内置搜索", badge: "API KEY", link: "https://console.anthropic.com/settings/keys" },
    ];
    const ENGINE_IDS = ENGINES.filter((engine) => engine.id !== "auto" && engine.id !== "multi").map((engine) => engine.id);
    // 与 lib/index.js 的 EXPLICIT_ONLY_ENGINES 同源：按次计费、只在显式选中时运行，因此不提供入池候选。
    const EXPLICIT_ONLY_ENGINES = ["openai", "gemini", "claude"];
    const MODEL_ENGINES = ENGINES.filter((engine) => EXPLICIT_ONLY_ENGINES.includes(engine.id));
    const DEFAULT_FALLBACK_ORDER = ["exa", "tavily", "keenable", "firecrawl", "parallel", "perplexity", "serpbase", "serply", "deepseek-official", "you", "baidu", "kimi", "aliyun", "doubao", "tinyfish", "jina", "bing", "anysearch", "ddg", "ddg-lite", "searxng", "zhihu_global", "zhihu_site"];
    const normalizeFallbackOrder = (value) => {
      const configured = Array.isArray(value) ? value.filter((id) => ENGINE_IDS.includes(id)) : [];
      return [...new Set([...configured, ...DEFAULT_FALLBACK_ORDER, ...ENGINE_IDS.filter((id) => !EXPLICIT_ONLY_ENGINES.includes(id))])].filter((id) => !EXPLICIT_ONLY_ENGINES.includes(id));
    };
    // 语言分池（评审意见 B）：zh/en 两池默认值与 lib/index.js 保持一致
    const DEFAULT_ZH_POOL = ["bing", "baidu", "aliyun", "anysearch"];
    const DEFAULT_EN_POOL = ["bing", "exa", "tavily"];
    const normalizePoolIds = (value, fallback) => {
      const configured = [...new Set((Array.isArray(value) ? value : []).filter((id) => ENGINE_IDS.includes(id)))];
      return configured.length > 0 ? configured : fallback.slice();
    };
    const FAILURE_CLASSES = [
      { id: "quota", labelKey: "classQuota" },
      { id: "auth", labelKey: "classAuth" },
      { id: "bot-wall", labelKey: "classBotWall" },
      { id: "transient", labelKey: "classTransient" },
      { id: "invalid-response", labelKey: "classInvalidResponse" },
      { id: "unknown", labelKey: "classUnknown" },
    ];
    const normalizeFallbackOn = (value) => {
      if (!Array.isArray(value)) return FAILURE_CLASSES.map((cls) => cls.id);
      return [...new Set(value.filter((id) => FAILURE_CLASSES.some((cls) => cls.id === id)))];
    };

    async function bridgeDescribe() {
      const response = await fetch(`${BRIDGE_PREFIX}/describe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      return response.json();
    }

    async function bridgeMutate(payload) {
      const response = await fetch(`${BRIDGE_PREFIX}/mutate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return response.json();
    }

    async function bridgeRawSearch(payload) {
      const response = await fetch(`${BRIDGE_PREFIX}/raw-search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return response.json();
    }

    async function bridgeCheckUpdate() {
      const response = await fetch(`${BRIDGE_PREFIX}/check-update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      return response.json();
    }

    async function bridgeCredentialsStatus() {
      const response = await fetch(`${BRIDGE_PREFIX}/credentials-status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      return response.json();
    }

    async function bridgeCredentialsSet(key, value) {
      const response = await fetch(`${BRIDGE_PREFIX}/credentials-set`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      return response.json();
    }

    async function bridgeCredentialsUnset(key) {
      const response = await fetch(`${BRIDGE_PREFIX}/credentials-unset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      return response.json();
    }

    // 插件页行配置的摘要文案（bundle 页每行显示；不触发 bridge 读取）
    function summaryText() {
      const primary = typeof navigator === "undefined" ? "zh" : String((navigator.languages && navigator.languages[0]) || navigator.language || "zh").toLowerCase();
      return primary.startsWith("en")
        ? "13 engines · time filtering · platform search · web_fetch"
        : "13 个搜索引擎 · 时间筛选 · 平台搜索 · web_fetch";
    }

    function FreeSearchCard(props) {
      // 检测应用主题深浅（读 body 的 --dsw-alias-bg-base 变量亮度），用于锁定原生下拉配色
      const isDarkScheme = react.useMemo(() => {
        try {
          const root = document.body || document.documentElement;
          const bg = getComputedStyle(root).getPropertyValue("--dsw-alias-bg-base").trim();
          const m = bg.match(/(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/);
          if (m) {
            const l = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
            return l < 128;
          }
          if (/^#([0-9a-f]{3,8})/i.test(bg)) {
            const hex = bg.slice(1);
            const h = hex.length <= 4 ? hex.replace(/./g, (c) => c + c) : hex;
            const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
            return 0.299 * r + 0.587 * g + 0.114 * b < 128;
          }
        } catch {}
        return typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : false;
      }, []);
      const selectColorScheme = isDarkScheme ? "dark" : "light";
      // 插件页（0.1.6-alpha.2+ 的 plugins.row.config）以 page 模式复用本卡片：
      // 页面自带标题/面包屑，卡片固定展开、表头不再可折叠。
      const pageMode = !!(props && props.page);
      const [open, setOpen] = react.useState(pageMode);
      const [state, setState] = react.useState({ status: "loading" });
      const [provider, setProvider] = react.useState("bing");
      const [disabledEngines, setDisabledEngines] = react.useState([]);
      const [fallbackOrder, setFallbackOrder] = react.useState(DEFAULT_FALLBACK_ORDER);
      const [dragIndex, setDragIndex] = react.useState(null);
      const [poolDrag, setPoolDrag] = react.useState(null);
      const [zhPool, setZhPool] = react.useState(DEFAULT_ZH_POOL);
      const [enPool, setEnPool] = react.useState(DEFAULT_EN_POOL);
      const [fallbackOn, setFallbackOn] = react.useState(FAILURE_CLASSES.map((cls) => cls.id));
      const [safeSearch, setSafeSearch] = react.useState("off");
      const [bingMarket, setBingMarket] = react.useState("zh-CN");
      const [anysearchKey, setAnysearchKey] = react.useState("");
      const [exaKey, setExaKey] = react.useState("");
      const [tavilyKey, setTavilyKey] = react.useState("");
      const [keenableKey, setKeenableKey] = react.useState("");
      const [firecrawlKey, setFirecrawlKey] = react.useState("");
      const [parallelKey, setParallelKey] = react.useState("");
      const [perplexityKey, setPerplexityKey] = react.useState("");
      const [deepseekKey, setDeepseekKey] = react.useState("");
      const [serpbaseKey, setSerpbaseKey] = react.useState("");
      const [serplyKey, setSerplyKey] = react.useState("");
      const [youcomKey, setYoucomKey] = react.useState("");
      const [baiduKey, setBaiduKey] = react.useState("");
      const [kimiKey, setKimiKey] = react.useState("");
      const [aliyunKey, setAliyunKey] = react.useState("");
      const [doubaoKey, setDoubaoKey] = react.useState("");
      const [openaiKey, setOpenaiKey] = react.useState("");
      const [geminiKey, setGeminiKey] = react.useState("");
      const [claudeKey, setClaudeKey] = react.useState("");
      const [zhihuKey, setZhihuKey] = react.useState("");
      const [tinyfishKey, setTinyfishKey] = react.useState("");
      const [jinaKey, setJinaKey] = react.useState("");
      const [platforms, setPlatforms] = react.useState(["github", "v2ex", "bilibili", "reddit", "hn", "stackoverflow", "wikipedia", "npm", "youtube", "vimeo"]);
      const [cacheTtl, setCacheTtl] = react.useState(5);
      const [keysConfigured, setKeysConfigured] = react.useState({});
      // key 存储位置：credentials（凭据中心，默认）| settings（设置页，兼容旧行为）
      const [keyStorage, setKeyStorage] = react.useState("credentials");
      // 凭据中心里已配置的 key（describe 不返回，需单独查）
      const [credConfigured, setCredConfigured] = react.useState({});
      const [lang, setLang] = react.useState("zh");
      const [dirty, setDirty] = react.useState(false);
      const [saving, setSaving] = react.useState(false);
      const [failed, setFailed] = react.useState(false);
      // 保存失败明细（credentials-set / mutate 的 code+message），成功或改表单时清空
      const [saveError, setSaveError] = react.useState("");
      const [testing, setTesting] = react.useState(false);
      const [testResult, setTestResult] = react.useState(null);
      const [checkingUpdate, setCheckingUpdate] = react.useState(false);
      const [upgrading, setUpgrading] = react.useState(false);
      const [updateInfo, setUpdateInfo] = react.useState(null);
      // 回退优先级/池列表行内 key 输入：引擎 id → [当前值, setter]（zhihu 两引擎共享 ZHIHU_API_KEY）
      const KEY_INPUTS = {
        anysearch: [anysearchKey, setAnysearchKey],
        exa: [exaKey, setExaKey],
        tavily: [tavilyKey, setTavilyKey],
        keenable: [keenableKey, setKeenableKey],
        firecrawl: [firecrawlKey, setFirecrawlKey],
        parallel: [parallelKey, setParallelKey],
        perplexity: [perplexityKey, setPerplexityKey],
        "deepseek-official": [deepseekKey, setDeepseekKey],
        serpbase: [serpbaseKey, setSerpbaseKey],
        serply: [serplyKey, setSerplyKey],
        you: [youcomKey, setYoucomKey],
        baidu: [baiduKey, setBaiduKey],
        kimi: [kimiKey, setKimiKey],
        aliyun: [aliyunKey, setAliyunKey],
        doubao: [doubaoKey, setDoubaoKey],
        tinyfish: [tinyfishKey, setTinyfishKey],
        jina: [jinaKey, setJinaKey],
        zhihu_global: [zhihuKey, setZhihuKey],
        zhihu_site: [zhihuKey, setZhihuKey],
        openai: [openaiKey, setOpenaiKey],
        gemini: [geminiKey, setGeminiKey],
        claude: [claudeKey, setClaudeKey],
      };
      // #68 密钥状态可视化：引擎 id → 配置中心键名（少数引擎不同名），三态：已配置/可选/缺失
      const CONFIGURED_KEY_ID = { "deepseek-official": "deepseek", you: "youcom", zhihu_global: "zhihu", zhihu_site: "zhihu" };
      const NO_KEY_ENGINES = ["ddg", "ddg-lite", "bing", "searxng"];
      const OPTIONAL_KEY_ENGINES = ["anysearch", "exa", "tavily", "keenable", "firecrawl", "parallel"];
      const hasConfiguredKey = (id) => {
        const k = CONFIGURED_KEY_ID[id] ?? id;
        return Boolean(keysConfigured[k] || credConfigured[k]);
      };
      const renderKeyStatus = (id) => {
        if (NO_KEY_ENGINES.includes(id)) return null;
        const configured = hasConfiguredKey(id);
        const optional = OPTIONAL_KEY_ENGINES.includes(id);
        const state = configured ? "ok" : optional ? "opt" : "miss";
        const title = configured ? t.keyStatusConfigured : optional ? t.keyStatusOptional : t.keyStatusMissing;
        return react_jsx_runtime.jsx("span", {
          className: "dshfs-keyStatus dshfs-keyStatus-" + state,
          title,
          "aria-label": title,
        });
      };

      const load = react.useCallback(async () => {
        try {
          const result = await bridgeDescribe();
          if (result.ok) {
            const view = result.value.namespaces.find((n) => n.ns === NS);
            if (view) {
              const v = view.value ?? {};
              setProvider(v.provider ?? "ddg");
              setDisabledEngines(
                Array.isArray(v.disabledEngines)
                  ? [...new Set(v.disabledEngines.filter((id) => ENGINES.some((engine) => engine.id === id && id !== "auto" && id !== "multi")))]
                  : []
              );
              setFallbackOrder(normalizeFallbackOrder(v.fallbackOrder));
              setZhPool(normalizePoolIds(v.zhPool, DEFAULT_ZH_POOL));
              setEnPool(normalizePoolIds(v.enPool, DEFAULT_EN_POOL));
              setFallbackOn(normalizeFallbackOn(v.fallbackOn));
              setSafeSearch(v.safeSearch === "strict" || v.safeSearch === "moderate" ? v.safeSearch : "off");
              setBingMarket(v.bingMarket === undefined ? "zh-CN" : v.bingMarket);
              setLang(v.lang === "en" ? "en" : "zh");
              setAnysearchKey(v.anysearchApiKey ?? "");
              setExaKey(v.exaApiKey ?? "");
              setTavilyKey(v.tavilyApiKey ?? "");
              setKeenableKey(v.keenableApiKey ?? "");
              setFirecrawlKey(v.firecrawlApiKey ?? "");
              setParallelKey(v.parallelApiKey ?? "");
              setPerplexityKey(v.perplexityApiKey ?? "");
              setDeepseekKey(v.deepseekApiKey ?? "");
              setSerpbaseKey(v.serpbaseApiKey ?? "");
              setSerplyKey(v.serplyApiKey ?? "");
              setYoucomKey(v.youcomApiKey ?? "");
              setBaiduKey(v.baiduApiKey ?? "");
              setKimiKey(v.kimiApiKey ?? "");
              setAliyunKey(v.aliyunApiKey ?? "");
              setDoubaoKey(v.doubaoApiKey ?? "");
              setOpenaiKey(v.openaiApiKey ?? "");
              setGeminiKey(v.geminiApiKey ?? "");
              setClaudeKey(v.claudeApiKey ?? "");
              setZhihuKey(v.zhihuApiKey ?? "");
              setTinyfishKey(v.tinyfishApiKey ?? "");
              setJinaKey(v.jinaApiKey ?? "");
              setPlatforms(Array.isArray(v.platforms) && v.platforms.length > 0 ? v.platforms : ["github", "v2ex", "bilibili", "reddit", "hn", "stackoverflow", "wikipedia", "npm", "youtube", "vimeo"]);
              setCacheTtl(v.cacheTtl === undefined ? 5 : Math.min(Math.max(Number(v.cacheTtl) ?? 5, 0), 5));
              // secrets 字段标记哪些 key 已配置（值被脱敏，仅显示"已配置"）
              const configured = {};
              for (const secret of view.secrets ?? []) {
                if (secret.set) {
                  const path = secret.path.join(".");
                  if (path === "anysearchApiKey") configured.anysearch = true;
                  if (path === "exaApiKey") configured.exa = true;
                  if (path === "tavilyApiKey") configured.tavily = true;
                  if (path === "keenableApiKey") configured.keenable = true;
                  if (path === "firecrawlApiKey") configured.firecrawl = true;
                  if (path === "parallelApiKey") configured.parallel = true;
                  if (path === "perplexityApiKey") configured.perplexity = true;
                  if (path === "deepseekApiKey") configured.deepseek = true;
                  if (path === "serpbaseApiKey") configured.serpbase = true;
                  if (path === "serplyApiKey") configured.serply = true;
                  if (path === "youcomApiKey") configured.youcom = true;
                  if (path === "baiduApiKey") configured.baidu = true;
                  if (path === "kimiApiKey") configured.kimi = true;
                  if (path === "aliyunApiKey") configured.aliyun = true;
                  if (path === "doubaoApiKey") configured.doubao = true;
                  if (path === "openaiApiKey") configured.openai = true;
                  if (path === "geminiApiKey") configured.gemini = true;
                  if (path === "claudeApiKey") configured.claude = true;
                  if (path === "zhihuApiKey") configured.zhihu = true;
                  if (path === "tinyfishApiKey") configured.tinyfish = true;
                  if (path === "jinaApiKey") configured.jina = true;
                }
              }
              setKeysConfigured(configured);
              // key 存储位置（默认凭据中心）
              setKeyStorage(v.keyStorage === "settings" ? "settings" : "credentials");
              setState({ status: "ready", writable: result.value.writable });
              // 查询凭据中心里各 key 的配置状态
              try {
                const cred = await bridgeCredentialsStatus();
                if (cred.ok) {
                  const cc = {};
                  const map = { anysearchApiKey: "anysearch", exaApiKey: "exa", tavilyApiKey: "tavily", keenableApiKey: "keenable", firecrawlApiKey: "firecrawl", parallelApiKey: "parallel", perplexityApiKey: "perplexity", deepseekApiKey: "deepseek", serpbaseApiKey: "serpbase", serplyApiKey: "serply", youcomApiKey: "youcom", baiduApiKey: "baidu", kimiApiKey: "kimi", aliyunApiKey: "aliyun", doubaoApiKey: "doubao", openaiApiKey: "openai", geminiApiKey: "gemini", claudeApiKey: "claude", zhihuApiKey: "zhihu", tinyfishApiKey: "tinyfish", jinaApiKey: "jina" };
                  for (const [k, v] of Object.entries(cred.value.configured ?? {})) {
                    if (map[k]) cc[map[k]] = v;
                  }
                  setCredConfigured(cc);
                }
              } catch {}
            } else {
              setState({ status: "unavailable" });
            }
          } else {
            setState({ status: "unavailable" });
          }
        } catch {
          setState({ status: "unavailable" });
        }
      }, []);

      react.useEffect(() => {
        load();
      }, [load]);

      const select = (value) => {
        setProvider(value);
        setDirty(true);
        setFailed(false);
        setSaveError("");
      };

      const save = async () => {
        setSaving(true);
        setFailed(false);
        setSaveError("");
        const errors = [];
        try {
          // key 存储分流：凭据中心（默认）走 credentials-set；设置页走 settings mutate（兼容）
          const keyFields = [
            ["anysearchApiKey", anysearchKey],
            ["exaApiKey", exaKey],
            ["tavilyApiKey", tavilyKey],
            ["keenableApiKey", keenableKey],
            ["firecrawlApiKey", firecrawlKey],
            ["parallelApiKey", parallelKey],
            ["perplexityApiKey", perplexityKey],
            ["deepseekApiKey", deepseekKey],
            ["serpbaseApiKey", serpbaseKey],
            ["serplyApiKey", serplyKey],
            ["youcomApiKey", youcomKey],
            ["baiduApiKey", baiduKey],
            ["kimiApiKey", kimiKey],
            ["aliyunApiKey", aliyunKey],
            ["doubaoApiKey", doubaoKey],
            ["openaiApiKey", openaiKey],
            ["geminiApiKey", geminiKey],
            ["claudeApiKey", claudeKey],
            ["zhihuApiKey", zhihuKey],
            ["tinyfishApiKey", tinyfishKey],
            ["jinaApiKey", jinaKey],
          ];
          if (keyStorage === "credentials") {
            for (const [field, value] of keyFields) {
              if (!value.trim()) continue;
              const r = await bridgeCredentialsSet(field, value.trim());
              if (!r || !r.ok) {
                const code = (r && r.code) || "error";
                const msg = (r && r.message) || "";
                errors.push(`credentials-set ${field}: ${code}${msg ? " — " + msg : ""}`);
              }
            }
          }
          const ops = [{ op: "set", path: ["provider"], value: provider }];
          ops.push({ op: "set", path: ["disabledEngines"], value: disabledEngines });
          ops.push({ op: "set", path: ["fallbackOrder"], value: normalizeFallbackOrder(fallbackOrder) });
          ops.push({ op: "set", path: ["zhPool"], value: normalizePoolIds(zhPool, DEFAULT_ZH_POOL) });
          ops.push({ op: "set", path: ["enPool"], value: normalizePoolIds(enPool, DEFAULT_EN_POOL) });
          ops.push({ op: "set", path: ["fallbackOn"], value: normalizeFallbackOn(fallbackOn) });
          ops.push({ op: "set", path: ["lang"], value: lang });
          ops.push({ op: "set", path: ["keyStorage"], value: keyStorage });
          ops.push({ op: "set", path: ["safeSearch"], value: safeSearch });
          ops.push({ op: "set", path: ["bingMarket"], value: bingMarket });
          if (keyStorage !== "credentials") {
            // settings 模式：key 写入当前 profile 的插件条目 config（cordis.patch.yml）
            for (const [field, value] of keyFields) {
              if (value.trim()) ops.push({ op: "set", path: [field], value: value.trim() });
            }
          }
          ops.push({ op: "set", path: ["platforms"], value: platforms });
          ops.push({ op: "set", path: ["cacheTtl"], value: Math.min(Math.max(Number(cacheTtl) ?? 5, 0), 5) });
          const result = await bridgeMutate({ ns: NS, ops });
          if (!result || !result.ok) {
            const code = (result && result.code) || "error";
            const msg = (result && result.message) || "";
            errors.push(`mutate: ${code}${msg ? " — " + msg : ""}`);
          }
          if (errors.length === 0) {
            setDirty(false);
            setProvider(result.value.value.provider ?? provider);
            setFailed(false);
            setSaveError("");
            load();
          } else {
            const detail = errors.join("; ");
            setFailed(true);
            setSaveError(detail);
            console.error("[dsh-free-search] save failed:", detail);
          }
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          setFailed(true);
          setSaveError(`exception: ${msg}`);
          console.error("[dsh-free-search] save exception:", e);
        } finally {
          setSaving(false);
        }
      };

      const discard = () => {
        load();
        setDirty(false);
        setFailed(false);
        setSaveError("");
      };

      const runTest = async () => {
        setTesting(true);
        setTestResult(null);
        setFailed(false);
        setSaveError("");
        try {
          const result = await bridgeRawSearch({
            query: "DeepSeek Harness",
            maxResults: 2,
            engine: provider,
          });
          if (result.ok) {
            const sources = result.value.sources ?? [];
            setTestResult({
              ok: true,
              count: sources.length,
              engine: result.value.provider === "multi_search" ? "multi" : (result.value.provider ?? provider),
              content: result.value.content ?? "",
              sample: sources[0]?.title ?? "",
            });
          } else {
            setTestResult({ ok: false, error: result.message ?? "unknown error" });
          }
        } catch {
          setTestResult({ ok: false, error: "request failed" });
        } finally {
          setTesting(false);
        }
      };

      const runCheckUpdate = async () => {
        setCheckingUpdate(true);
        setUpdateInfo(null);
        setFailed(false);
        setSaveError("");
        try {
          const result = await bridgeCheckUpdate();
          if (result.ok) {
            setUpdateInfo({ ok: true, ...result.value });
          } else {
            setUpdateInfo({ ok: false });
          }
        } catch {
          setUpdateInfo({ ok: false });
        } finally {
          setCheckingUpdate(false);
        }
      };

      const runUpdate = async () => {
        setUpgrading(true);
        setUpdateInfo(null);
        setFailed(false);
        setSaveError("");
        try {
          const response = await fetch(`${BRIDGE_PREFIX}/update`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          });
          const result = await response.json();
          if (result.ok) {
            setUpdateInfo({ ok: true, hasUpdate: false, upgraded: true, message: result.value.message, latest: result.value.latest });
          } else {
            setUpdateInfo({ ok: false, upgradeFailed: result.message ?? "upgrade failed" });
          }
        } catch {
          setUpdateInfo({ ok: false, upgradeFailed: "request failed" });
        } finally {
          setUpgrading(false);
        }
      };

      if (state.status === "loading") return null;
      const ready = state.status === "ready";
      const t = tt(lang);
      const title = "Free Search";
      const description = t.description;
      const enabledEngineCount = ENGINES.filter((e) => e.id !== "auto" && e.id !== "multi" && !disabledEngines.includes(e.id)).length;
      const currentEngine = ENGINES.find((e) => e.id === provider) ?? ENGINES.find((e) => e.id === "bing") ?? ENGINES[0];
      const moveFallbackEngineTo = (fromIndex, toIndex) => {
        setFallbackOrder((prev) => {
          const next = normalizeFallbackOrder(prev);
          if (fromIndex < 0 || toIndex < 0 || fromIndex >= next.length || toIndex >= next.length || fromIndex === toIndex) return next;
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return next;
        });
        setDirty(true);
        setFailed(false);
        setSaveError("");
      };
      // 语言分池（评审意见 B）：两块池列表，行结构复用回退优先级（拖拽排序 + 手柄），外加增删；每池最低 2 个引擎、不设上限
      const movePoolItemTo = (setPool, fromIndex, toIndex) => {
        setPool((prev) => {
          if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length || fromIndex === toIndex) return prev;
          const next = [...prev];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return next;
        });
        setDirty(true);
        setFailed(false);
        setSaveError("");
      };
      const renderPoolField = (poolKey, label, pool, setPool, defaultPool, withHint) => {
        const removable = pool.length > 2;
        const candidates = ENGINE_IDS.filter((id) => !pool.includes(id) && !EXPLICIT_ONLY_ENGINES.includes(id));
        return react_jsx_runtime.jsx("div", {
          className: "dshfs-field",
          children: [
            react_jsx_runtime.jsx("div", {
              className: "dshfs-label",
              children: label,
            }),
            react_jsx_runtime.jsx("div", {
              className: "dshfs-priorityList",
              children: pool.map((engineId, index) => {
                const engine = ENGINES.find((item) => item.id === engineId);
                if (!engine) return null;
                const isDisabled = disabledEngines.includes(engineId);
                const dragging = poolDrag !== null && poolDrag.key === poolKey && poolDrag.index === index;
                return react_jsx_runtime.jsx("div", {
                  className: "dshfs-priorityRow" + (isDisabled ? " dshfs-priorityRowDisabled" : "") + (dragging ? " dshfs-priorityRowDragging" : ""),
                  draggable: ready && !saving,
                  onDragStart: (e) => {
                    setPoolDrag({ key: poolKey, index });
                    try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(index)); } catch {}
                  },
                  onDragOver: (e) => {
                    if (poolDrag !== null && poolDrag.key === poolKey) {
                      e.preventDefault();
                      try { e.dataTransfer.dropEffect = "move"; } catch {}
                    }
                  },
                  onDrop: (e) => {
                    e.preventDefault();
                    const source = poolDrag;
                    setPoolDrag(null);
                    if (source !== null && source.key === poolKey && source.index !== index) movePoolItemTo(setPool, source.index, index);
                  },
                  onDragEnd: () => setPoolDrag(null),
                  children: [
                    react_jsx_runtime.jsx("span", { className: "dshfs-priorityIndex", children: String(index + 1) }),
                    react_jsx_runtime.jsx("span", {
                      className: "dshfs-priorityName",
                      children: `${engine.label} (${engine.badge})${isDisabled ? " · " + t.priorityDisabled : ""}`,
                    }),
                    react_jsx_runtime.jsx("span", {
                      className: "dshfs-priorityActions",
                      children: [
                        react_jsx_runtime.jsx("span", {
                          className: "dshfs-priorityHandle",
                          title: "拖动排序",
                          "aria-hidden": "true",
                          children: "⠿",
                        }, "handle"),
                        react_jsx_runtime.jsx("button", {
                          type: "button",
                          className: "dshfs-btn dshfs-priorityBtn",
                          disabled: !ready || saving || !removable,
                          onClick: () => {
                            setPool((prev) => prev.filter((id) => id !== engineId));
                            setDirty(true);
                            setFailed(false);
                            setSaveError("");
                          },
                          "aria-label": `${engine.label} ${t.poolRemove}`,
                          title: t.poolRemove,
                          children: "−",
                        }, "remove"),
                      ],
                    }),
                  ],
                }, engineId);
              }),
            }),
            react_jsx_runtime.jsx("div", {
              children: [
                react_jsx_runtime.jsx("select", {
                  className: "dshfs-select",
                  value: "",
                  style: { colorScheme: selectColorScheme },
                  disabled: !ready || saving || candidates.length === 0,
                  onChange: (e) => {
                    const id = e.target.value;
                    if (!id) return;
                    setPool((prev) => [...prev, id]);
                    setDirty(true);
                    setFailed(false);
                    setSaveError("");
                  },
                  children: [
                    react_jsx_runtime.jsx("option", { value: "", children: t.poolAddFirst }, "placeholder"),
                    ...candidates.map((id) => {
                      const engine = ENGINES.find((item) => item.id === id);
                      return react_jsx_runtime.jsx("option", { value: id, children: `${engine.label} (${engine.badge})` }, id);
                    }),
                  ],
                }),
                react_jsx_runtime.jsx("button", {
                  type: "button",
                  className: "dshfs-btn",
                  disabled: !ready || saving || pool.join(",") === defaultPool.join(","),
                  onClick: () => {
                    setPool(defaultPool.slice());
                    setDirty(true);
                    setFailed(false);
                    setSaveError("");
                  },
                  children: t.poolReset,
                }, "reset"),
              ],
            }),
            ...(withHint ? [react_jsx_runtime.jsx("p", {
              className: "dshfs-hint",
              children: t.languagePoolHint,
            })] : []),
          ],
        });
      };
      const badgeClass =
        currentEngine.badge === "AUTO"
          ? "dshfs-badge dshfs-badgeAuto"
          : currentEngine.badge === "MULTI"
            ? "dshfs-badge dshfs-badgeMulti"
            : currentEngine.badge === "FREE"
              ? "dshfs-badge dshfs-badgeFree"
              : "dshfs-badge dshfs-badgeKey";

      const toggleLang = () => {
        setLang((prev) => (prev === "en" ? "zh" : "en"));
        setDirty(true);
        setFailed(false);
        setSaveError("");
      };

      return react_jsx_runtime.jsx("li", {
        className: (open ? "dshfs-card dshfs-cardOpen" : "dshfs-card") + (pageMode ? " dshfs-pageMode" : ""),
        children: [
          react_jsx_runtime.jsx("button", {
            type: "button",
            className: "dshfs-header",
            "aria-expanded": pageMode ? void 0 : open,
            onClick: pageMode ? void 0 : () => setOpen(!open),
            children: [
                      react_jsx_runtime.jsx("span", { className: "dshfs-headText", children: [
                  react_jsx_runtime.jsx("span", { className: "dshfs-name", children: title }),
                  react_jsx_runtime.jsx("span", { className: "dshfs-description", children: description }),
                ] }),
                react_jsx_runtime.jsx("span", { className: badgeClass, children: currentEngine.badge }),
              dirty ? react_jsx_runtime.jsx("span", { className: "dshfs-pending", children: t.unsaved }) : null,
              react_jsx_runtime.jsx("button", {
                type: "button",
                className: "dshfs-btn dshfs-langToggle",
                onClick: (e) => {
                  e.stopPropagation();
                  toggleLang();
                },
                children: t.toggleLang,
              }),
              react_jsx_runtime.jsx("span", {
                className: open ? "dshfs-chevron dshfs-chevronOpen" : "dshfs-chevron",
                children: "▾",
              }),
            ],
          }),
          open
            ? react_jsx_runtime.jsx("div", {
                className: "dshfs-body",
                children: [
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-field",
                    children: [
react_jsx_runtime.jsx("div", {
                        className: "dshfs-label",
                        children: [
                          t.searchEngine,
                          react_jsx_runtime.jsx("span", { className: badgeClass, children: currentEngine.badge }),
                        ],
                      }),
                      react_jsx_runtime.jsx("select", {
                        className: "dshfs-select",
                        value: provider,
                        style: { colorScheme: selectColorScheme },
                        disabled: !ready || saving,
                        onChange: (e) => select(e.target.value),
                        children: ENGINES.map((engine) =>
                          react_jsx_runtime.jsx("option", {
                            value: engine.id,
                            disabled: engine.id !== "auto" && engine.id !== "multi" && disabledEngines.includes(engine.id),
                            children: `${engine.label} (${engine.badge})${engine.id !== "auto" && engine.id !== "multi" && disabledEngines.includes(engine.id) ? " · DISABLED" : ""}`,
                          }, engine.id)
                        ),
                      }),
                      currentEngine.link
                        ? react_jsx_runtime.jsx("a", {
                            className: "dshfs-link",
                            href: currentEngine.link,
                            target: "_blank",
                            rel: "noopener noreferrer",
                            children:
                              currentEngine.badge === "FREE"
                                ? t.visit
                                : t.getKey,
                          })
                        : null,
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.engineHint,
                      }),
                    ],
                  }),
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-field",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-label",
                        children: t.engineEnable,
                      }),
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-platforms",
                        children: ENGINES.filter((engine) => engine.id !== "auto" && engine.id !== "multi").map((engine) => {
                          const enabled = !disabledEngines.includes(engine.id);
                          const lastEnabled = enabled && enabledEngineCount <= 1;
                          return react_jsx_runtime.jsx("label", {
                            className: "dshfs-platform",
                            children: [
                              react_jsx_runtime.jsx("input", {
                                type: "checkbox",
                                checked: enabled,
                                disabled: !ready || saving || lastEnabled,
                                onChange: (e) => {
                                  const nextEnabled = e.target.checked;
                                  setDisabledEngines((prev) => {
                                    const next = nextEnabled
                                      ? prev.filter((id) => id !== engine.id)
                                      : [...new Set([...prev, engine.id])];
                                    return next;
                                  });
                                  if (!nextEnabled && provider === engine.id) setProvider("auto");
                                  setDirty(true);
                                  setFailed(false);
                                  setSaveError("");
                                },
                              }),
                              `${engine.label} (${engine.badge})`,
                            ],
                          }, engine.id);
                        }),
                      }),
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.engineEnableHint,
                      }),
                    ],
                  }),
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-field",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-label",
                        children: t.fallbackPriority,
                      }),
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-priorityList",
                        children: fallbackOrder.map((engineId, index) => {
                          const engine = ENGINES.find((item) => item.id === engineId);
                          if (!engine) return null;
                          const isDisabled = disabledEngines.includes(engineId);
                          return react_jsx_runtime.jsx("div", {
                            className: "dshfs-priorityRow" + (isDisabled ? " dshfs-priorityRowDisabled" : "") + (dragIndex === index ? " dshfs-priorityRowDragging" : ""),
                            draggable: ready && !saving,
                            onDragStart: (e) => {
                              setDragIndex(index);
                              try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(index)); } catch {}
                            },
                            onDragOver: (e) => {
                              if (dragIndex !== null) {
                                e.preventDefault();
                                try { e.dataTransfer.dropEffect = "move"; } catch {}
                              }
                            },
                            onDrop: (e) => {
                              e.preventDefault();
                              const from = dragIndex;
                              setDragIndex(null);
                              if (from !== null && from !== index) moveFallbackEngineTo(from, index);
                            },
                            onDragEnd: () => setDragIndex(null),
                            children: [
                              react_jsx_runtime.jsx("span", { className: "dshfs-priorityIndex", children: String(index + 1) }),
                              react_jsx_runtime.jsx("span", {
                                className: "dshfs-priorityName",
                                children: `${engine.label} (${engine.badge})${isDisabled ? " · " + t.priorityDisabled : ""}`,
                              }),
                              renderKeyStatus(engineId),
                              (() => {
                                const k = KEY_INPUTS[engineId];
                                if (!k) return null;
                                return react_jsx_runtime.jsx("input", {
                                  className: "dshfs-priorityKey",
                                  type: "password",
                                  placeholder: "API key",
                                  value: k[0],
                                  disabled: !ready || saving,
                                  onDragStart: (e) => { e.preventDefault(); e.stopPropagation(); },
                                  onChange: (e) => {
                                    k[1](e.target.value);
                                    setDirty(true);
                                    setFailed(false);
                                    setSaveError("");
                                  },
                                });
                              })(),
                              react_jsx_runtime.jsx("span", {
                                className: "dshfs-priorityActions",
                                children: [
                                  react_jsx_runtime.jsx("span", {
                                    className: "dshfs-priorityHandle",
                                    title: "拖动排序",
                                    "aria-hidden": "true",
                                    children: "⠿",
                                  }, "handle"),
                                ],
                              }),
                            ],
                          }, engineId);
                        }),
                      }),
                      react_jsx_runtime.jsx("div", {
                        children: react_jsx_runtime.jsx("button", {
                          type: "button",
                          className: "dshfs-btn",
                          disabled: !ready || saving || fallbackOrder.join(",") === DEFAULT_FALLBACK_ORDER.join(","),
                          onClick: () => {
                            setFallbackOrder(DEFAULT_FALLBACK_ORDER.slice());
                            setDirty(true);
                            setFailed(false);
                            setSaveError("");
                          },
                          children: t.fallbackPriorityReset,
                        }),
                      }),
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.fallbackPriorityHint,
                      }),
                    ],
                  }),
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-field",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-label",
                        children: t.billedLabel,
                      }),
                      MODEL_ENGINES.map((engine) => {
                        const k = KEY_INPUTS[engine.id];
                        return react_jsx_runtime.jsx("div", {
                          className: "dshfs-priorityRow",
                          children: [
                            react_jsx_runtime.jsx("span", {
                              className: "dshfs-priorityName",
                              children: `${engine.label} (${engine.badge})`,
                            }),
                            renderKeyStatus(engine.id),
                            k
                              ? react_jsx_runtime.jsx("input", {
                                  className: "dshfs-priorityKey",
                                  type: "password",
                                  placeholder: "API key",
                                  value: k[0],
                                  disabled: !ready || saving,
                                  onChange: (e) => {
                                    k[1](e.target.value);
                                    setDirty(true);
                                    setFailed(false);
                                    setSaveError("");
                                  },
                                })
                              : null,
                          ],
                        }, engine.id);
                      }),
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.billedHint,
                      }),
                    ],
                  }),
              renderPoolField("zh", t.zhPoolLabel, zhPool, setZhPool, DEFAULT_ZH_POOL, false),
              renderPoolField("en", t.enPoolLabel, enPool, setEnPool, DEFAULT_EN_POOL, true),
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-field",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-label",
                        children: t.fallbackOnLabel,
                      }),
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-platforms",
                        children: FAILURE_CLASSES.map((cls) => {
                          const checked = fallbackOn.includes(cls.id);
                          return react_jsx_runtime.jsx("label", {
                            className: "dshfs-platform",
                            children: [
                              react_jsx_runtime.jsx("input", {
                                type: "checkbox",
                                checked,
                                disabled: !ready || saving,
                                onChange: (e) => {
                                  const on = e.target.checked;
                                  setFallbackOn((prev) => (on ? [...new Set([...prev, cls.id])] : prev.filter((id) => id !== cls.id)));
                                  setDirty(true);
                                  setFailed(false);
                                  setSaveError("");
                                },
                              }),
                              t[cls.labelKey],
                            ],
                          }, cls.id);
                        }),
                      }),
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.fallbackOnHint,
                      }),
                    ],
                  }),
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-field",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-label",
                        children: t.safeSearchLabel,
                      }),
                      react_jsx_runtime.jsx("select", {
                        className: "dshfs-select",
                        value: safeSearch,
                        style: { colorScheme: selectColorScheme },
                        disabled: !ready || saving,
                        onChange: (e) => setSafeSearch(e.target.value),
                        children: [
                          react_jsx_runtime.jsx("option", { value: "off", children: t.safeSearchOff }, "off"),
                          react_jsx_runtime.jsx("option", { value: "moderate", children: t.safeSearchModerate }, "moderate"),
                          react_jsx_runtime.jsx("option", { value: "strict", children: t.safeSearchStrict }, "strict"),
                        ],
                      }),
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.safeSearchHint,
                      }),
                    ],
                  }),
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-field",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-label",
                        children: t.bingMarketLabel,
                      }),
                      react_jsx_runtime.jsx("select", {
                        className: "dshfs-select",
                        value: bingMarket,
                        style: { colorScheme: selectColorScheme },
                        disabled: !ready || saving,
                        onChange: (e) => setBingMarket(e.target.value),
                        children: [
                          react_jsx_runtime.jsx("option", { value: "zh-CN", children: t.marketZhCN }, "zh-CN"),
                          react_jsx_runtime.jsx("option", { value: "zh-TW", children: t.marketZhTW }, "zh-TW"),
                          react_jsx_runtime.jsx("option", { value: "en-US", children: t.marketEnUS }, "en-US"),
                          react_jsx_runtime.jsx("option", { value: "en-GB", children: t.marketEnGB }, "en-GB"),
                          react_jsx_runtime.jsx("option", { value: "ru-RU", children: t.marketRuRU }, "ru-RU"),
                          react_jsx_runtime.jsx("option", { value: "ja-JP", children: t.marketJaJP }, "ja-JP"),
                          react_jsx_runtime.jsx("option", { value: "de-DE", children: t.marketDeDE }, "de-DE"),
                          react_jsx_runtime.jsx("option", { value: "fr-FR", children: t.marketFrFR }, "fr-FR"),
                          react_jsx_runtime.jsx("option", { value: "es-ES", children: t.marketEsES }, "es-ES"),
                          react_jsx_runtime.jsx("option", { value: "ko-KR", children: t.marketKoKR }, "ko-KR"),
                        ],
                      }),
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.bingMarketHint,
                      }),
                    ],
                  }),
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-field",
                    children: [
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.keysHint,
                      }),
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-fieldRow",
                        children: [
                          react_jsx_runtime.jsx("label", {
                            className: "dshfs-label",
                            children: t.keyStorage,
                          }),
                          react_jsx_runtime.jsx("select", {
                            className: "dshfs-select dshfs-keyStorage",
                            value: keyStorage,
                            style: { colorScheme: selectColorScheme },
                            disabled: !ready || saving,
                            onChange: (e) => {
                              setKeyStorage(e.target.value);
                              setDirty(true);
                              setFailed(false);
                              setSaveError("");
                            },
                            children: [
                              react_jsx_runtime.jsx("option", { value: "credentials", children: t.keyStorageCred }),
                              react_jsx_runtime.jsx("option", { value: "settings", children: t.keyStorageSettings }),
                            ],
                          }),
                        ],
                      }),
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: keyStorage === "credentials" ? t.keyStorageCredHint(credConfigured) : t.keyStorageSettingsHint,
                      }),
                    ],
                  }),
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-field",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-label",
                        children: t.platformSearch,
                      }),
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-platforms",
                        children: [
                          ["github", "GitHub"], ["v2ex", "V2EX"], ["bilibili", "Bilibili"], ["reddit", "Reddit"],
                          ["hn", "Hacker News"], ["stackoverflow", "Stack Overflow"], ["wikipedia", "Wikipedia"], ["npm", "npm"],
                          ["youtube", "YouTube"], ["vimeo", "Vimeo"],
                        ].map(([id, label]) =>
                          react_jsx_runtime.jsx("label", {
                            className: "dshfs-platform",
                            children: [
                              react_jsx_runtime.jsx("input", {
                                type: "checkbox",
                                checked: platforms.includes(id),
                                disabled: !ready || saving,
                                onChange: (e) => {
                                  setPlatforms((prev) =>
                                    e.target.checked ? [...prev, id] : prev.filter((p) => p !== id)
                                  );
                                  setDirty(true);
                                  setFailed(false);
                                  setSaveError("");
                                },
                              }),
                              label,
                            ],
                          }, id)
                        ),
                      }),
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.platformHint,
                      }),
                    ],
                  }),
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-field",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-label",
                        children: t.cacheTtl,
                      }),
                      react_jsx_runtime.jsx("input", {
                        className: "dshfs-input dshfs-ttl",
                        type: "number",
                        min: 0,
                        max: 5,
                        step: 1,
                        value: cacheTtl,
                        disabled: !ready || saving,
                        onChange: (e) => {
                          setCacheTtl(Number(e.target.value));
                          setDirty(true);
                          setFailed(false);
                          setSaveError("");
                        },
                      }),
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.cacheTtlHint,
                      }),
                    ],
                  }),
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-resultRow",
                    children: [
                      failed
                        ? react_jsx_runtime.jsx("span", {
                            className: "dshfs-failed",
                            children: saveError ? t.saveFailedDetail(saveError) : t.saveFailed,
                          })
                        : null,
                      testResult
                        ? react_jsx_runtime.jsx("span", {
                            className: testResult.ok ? "dshfs-testOk" : "dshfs-failed",
                            children: testResult.ok
                              ? t.testOk(testResult)
                              : t.testFail(testResult.error),
                          })
                        : null,
                    ],
                  }),
                  !ready
                    ? react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.unavailable,
                      })
                    : null,
                  react_jsx_runtime.jsx("div", {
                    className: "dshfs-footer",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-footerLeft",
                        children: [
                          react_jsx_runtime.jsx("span", { className: "dshfs-version", children: "v" + PLUGIN_VERSION }),
                          updateInfo && updateInfo.ok && updateInfo.hasUpdate && !updateInfo.installable
                            ? react_jsx_runtime.jsx("a", {
                                className: "dshfs-updatePill",
                                href: updateInfo.updateUrl,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                title: t.updateAvailable(updateInfo.current, updateInfo.latest),
                                children: [
                                  react_jsx_runtime.jsx("svg", {
                                    className: "dshfs-updateIcon",
                                    viewBox: "0 0 16 16",
                                    width: 14,
                                    height: 14,
                                    "aria-hidden": "true",
                                    children: react_jsx_runtime.jsx("path", {
                                      d: "M8 2.2v6.4M5.2 6.4 8 9.2l2.8-2.8M3 10.8v1.4c0 .9.7 1.6 1.6 1.6h6.8c.9 0 1.6-.7 1.6-1.6v-1.4",
                                      fill: "none",
                                      stroke: "currentColor",
                                      strokeWidth: 1.6,
                                      strokeLinecap: "round",
                                      strokeLinejoin: "round",
                                    }),
                                  }),
                                  t.hasUpdate,
                                ],
                              })
                            : react_jsx_runtime.jsx("button", {
                                className: "dshfs-updatePill",
                                type: "button",
                                title: updateInfo && updateInfo.ok && updateInfo.hasUpdate ? t.updateAvailable(updateInfo.current, updateInfo.latest) : undefined,
                                onClick: updateInfo && updateInfo.ok && updateInfo.hasUpdate ? runUpdate : runCheckUpdate,
                                disabled: upgrading || checkingUpdate || saving || !ready,
                                children: [
                                  react_jsx_runtime.jsx("svg", {
                                    className: "dshfs-updateIcon",
                                    viewBox: "0 0 16 16",
                                    width: 14,
                                    height: 14,
                                    "aria-hidden": "true",
                                    children: react_jsx_runtime.jsx("path", {
                                      d: "M8 2.2v6.4M5.2 6.4 8 9.2l2.8-2.8M3 10.8v1.4c0 .9.7 1.6 1.6 1.6h6.8c.9 0 1.6-.7 1.6-1.6v-1.4",
                                      fill: "none",
                                      stroke: "currentColor",
                                      strokeWidth: 1.6,
                                      strokeLinecap: "round",
                                      strokeLinejoin: "round",
                                    }),
                                  }),
                                  upgrading
                                    ? t.upgrading
                                    : checkingUpdate
                                      ? t.checkingUpdate
                                      : updateInfo && updateInfo.ok && updateInfo.hasUpdate
                                        ? t.hasUpdate
                                        : t.checkUpdate,
                                ],
                              }),
                          updateInfo && updateInfo.ok
                            ? updateInfo.upgraded
                              ? react_jsx_runtime.jsx("span", {
                                  className: "dshfs-updateOk",
                                  children: t.upgradeDone(updateInfo.latest),
                                })
                              : updateInfo.hasUpdate
                                ? updateInfo.installable
                                  ? null
                                  : react_jsx_runtime.jsx("span", {
                                      className: "dshfs-version",
                                      children: t.upgradeLinkMode,
                                    })
                                : react_jsx_runtime.jsx("span", {
                                    className: "dshfs-updateOk",
                                    children: t.updateLatest(updateInfo.current),
                                  })
                            : updateInfo && !updateInfo.ok
                              ? react_jsx_runtime.jsx("span", {
                                  className: "dshfs-failed",
                                  children: updateInfo.upgradeFailed ? t.upgradeFailed(updateInfo.upgradeFailed) : t.updateCheckFailed,
                                })
                              : null,
                        ],
                      }),
                      react_jsx_runtime.jsx("div", {
                        className: "dshfs-footerRight",
                        children: [
                      react_jsx_runtime.jsx("button", {
                        className: "dshfs-btn",
                        type: "button",
                        onClick: runTest,
                        disabled: testing || saving || !ready,
                        children: testing ? t.testing : t.testEngine,
                      }),
                      react_jsx_runtime.jsx("button", {
                        className: "dshfs-btn",
                        type: "button",
                        onClick: () => {
                          setProvider("bing");
                          setDirty(true);
                          setFailed(false);
                          setSaveError("");
                        },
                        disabled: saving || !ready || provider === "bing" || disabledEngines.includes("bing"),
                        children: t.useBing,
                      }),
                      react_jsx_runtime.jsx("button", {
                        className: "dshfs-btn",
                        type: "button",
                        onClick: discard,
                        disabled: saving || !dirty,
                        children: t.discard,
                      }),
                      react_jsx_runtime.jsx("button", {
                        className: "dshfs-btn dshfs-save",
                        type: "button",
                        onClick: save,
                        disabled: saving || !dirty || !ready,
                        children: saving ? t.saving : t.save,
                      }),
                    ],
                  }),
                  ],
                })
              ],
            })
          : null,
        ],
      });
    }

    const inject = ["slots", "commandUi"];

    function apply(ctx) {
      // 挂插件页 slot：侧栏 插件 → 已安装 → free-search → 行配置页。
      // rc.1 废弃了旧版设置页的插件配置 slot，只保留 plugins.row.config；
      // key 规则见 ui-plugin-manager 的 rowConfigKey：<包名>#<patch 里声明的行 id>。
      // 配置读写走自建 bridge（/api/dsh-free-search-settings），不依赖 dsh-web-ui。
      ctx.slots.inject("plugins.row.config", () =>
        ctx.slots.register(
          {
            name: "plugins.row.config",
            key: "dsh-free-search#web-search-free",
          },
          (slotProps) =>
            slotProps && slotProps.view === "summary"
              ? summaryText()
              : react_jsx_runtime.jsx(FreeSearchCard, { page: true })
        )
      );
      // /free-search-engine 弹出式命令：输入 "/" 选中后弹出引擎列表，点选即切换。
      // 等效于设置页切换引擎+保存；命令只改 provider 配置，搜索仍走回退链。
      // description 必须传函数：ui-commands 读回的是 contribution.description()，
      // 传字符串会抛 TypeError: contribution.description is not a function；该异常
      // 会让整份 "/" 候选列表一起失败，菜单空白、其他命令也一起点不到。
      ctx.inject(["commandUi"], (sctx) => {
        const command = sctx.get("commandUi");
        sctx.effect(() => {
          const dispose = command.register({
            name: "free-search-engine",
            description: () => "切换搜索引擎 / Switch web search engine",
            available: () => true,
            ui: {
              kind: "popupSelect",
              options: async () => {
                const result = await bridgeDescribe();
                const view = result.ok ? result.value.namespaces.find((n) => n.ns === NS) : undefined;
                const current = view?.value?.provider ?? "bing";
                const disabled = new Set(Array.isArray(view?.value?.disabledEngines) ? view.value.disabledEngines : []);
                return ENGINES
                  .filter((e) => e.id === "auto" || e.id === "multi" || !disabled.has(e.id))
                  .map((e) => ({
                    id: e.id,
                    label: `${e.label}${e.badge === "AUTO" ? " · 智能路由" : e.badge === "MULTI" ? " · 并发合并" : e.badge === "FREE" ? " · 免费" : " · API Key"}`,
                    detail: e.id === current ? (view?.value?.lang === "en" ? "current" : "当前") : undefined,
                    active: e.id === current,
                  }));
              },
              onSelect: async (option) => {
                await bridgeMutate({ ns: NS, ops: [{ op: "set", path: ["provider"], value: option.id }] });
              },
            },
          });
          return dispose;
        }, "free-search: /free-search-engine command");
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
