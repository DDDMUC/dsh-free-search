window.__ModuleLoader__.load({
  id: "dsh-free-search",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    let react = require("react");
    let react_jsx_runtime = require("react/jsx-runtime");

    //#region css
    const css = [
      ".dshfs-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;min-width:0;list-style:none;transition:border-color .16s,background .16s;overflow:hidden;margin-bottom:8px}",
      ".dshfs-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
      ".dshfs-header{width:100%;color:inherit;cursor:pointer;text-align:left;font:inherit;background:0 0;border:0;align-items:center;gap:8px;padding:10px 14px;display:flex}",
      ".dshfs-header:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
      ".dshfs-headText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex;overflow:hidden}",
      ".dshfs-name{color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;font-weight:600;overflow:hidden}",
      ".dshfs-description{color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;font-size:12px;overflow:hidden}",
      ".dshfs-pending{color:var(--dsw-alias-state-warn-primary);white-space:nowrap;flex:none;font-size:12px}",
      ".dshfs-chevron{color:var(--dsw-alias-label-tertiary);flex:none;font-size:13px;transition:transform .12s}",
      ".dshfs-chevronOpen{transform:rotate(180deg)}",
      ".dshfs-body{flex-direction:column;gap:14px;padding:0 14px 14px;display:flex}",
      ".dshfs-footer{justify-content:space-between;align-items:center;gap:8px;display:flex;flex-wrap:wrap}",
      ".dshfs-footerLeft{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}",
      ".dshfs-footerRight{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".dshfs-failed{color:var(--dsw-alias-state-error-primary);font-size:12px}",
      ".dshfs-testOk{color:#7ddb9c;font-size:12px;line-height:1.5}",
      ".dshfs-resultRow{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;margin-top:2px}",
      ".dshfs-field{flex-direction:column;gap:4px;min-width:0;display:flex}",
      ".dshfs-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500}",
      ".dshfs-select{border:1px solid var(--dsw-alias-border-l2);font:inherit;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border-radius:6px;padding:6px 8px;font-size:13px;transition:border-color .13s,box-shadow .13s;width:100%}",
      ".dshfs-select:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}",
      ".dshfs-input{border:1px solid var(--dsw-alias-border-l2);font:inherit;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border-radius:6px;padding:6px 8px;font-size:13px;transition:border-color .13s,box-shadow .13s;width:100%}",
      ".dshfs-ttl{width:88px}",
      ".dshfs-input:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}",
      ".dshfs-input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}",
      ".dshfs-input:disabled{opacity:.6;cursor:default}",
      ".dshfs-hint{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px}",
      ".dshfs-platforms{display:flex;gap:10px;flex-wrap:wrap}",
      ".dshfs-platform{display:flex;align-items:center;gap:5px;color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer}",
      ".dshfs-platform input{accent-color:var(--dsw-alias-state-business-primary)}",
      ".dshfs-link{color:var(--dsw-alias-state-business-primary);font-size:12px;text-decoration:none;align-self:flex-start;padding:2px 0}",
      ".dshfs-link:hover{text-decoration:underline}",
      ".dshfs-btn{font:inherit;cursor:pointer;border-radius:6px;padding:5px 12px;font-size:13px;transition:background-color .13s,border-color .13s,color .13s}",
      ".dshfs-save{border:1px solid var(--dsw-alias-button-info-fill);background:var(--dsw-alias-button-info-fill);color:var(--dsw-alias-label-primary-foreground)}",
      ".dshfs-save:hover:not(:disabled){border-color:var(--dsw-alias-button-info-hover);background:var(--dsw-alias-button-info-hover)}",
      ".dshfs-save:disabled{opacity:.5;cursor:default}",
      ".dshfs-badge{background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-state-business-primary);white-space:nowrap;border-radius:999px;flex:none;padding:1px 6px;font-size:11px}",
      ".dshfs-badgeFree{background:rgba(80,200,120,.15);color:#7ddb9c;border:1px solid rgba(80,200,120,.3);white-space:nowrap;border-radius:999px;flex:none;padding:1px 6px;font-size:11px}",
      ".dshfs-badgeKey{background:rgba(240,170,80,.15);color:#f0b060;border:1px solid rgba(240,170,80,.3);white-space:nowrap;border-radius:999px;flex:none;padding:1px 6px;font-size:11px}",
      ".dshfs-langToggle{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:transparent;flex:none;padding:2px 8px;font-size:11px;border-radius:6px}",
      ".dshfs-update{color:var(--dsw-alias-state-warn-primary);flex:none;font-size:11px;white-space:nowrap;border:1px solid rgba(240,170,80,.3);background:rgba(240,170,80,.12);border-radius:999px;padding:1px 6px}",
      ".dshfs-updateOk{color:#7ddb9c;flex:none;font-size:11px;white-space:nowrap;border:1px solid rgba(80,200,120,.3);background:rgba(80,200,120,.12);border-radius:999px;padding:1px 6px}",
      ".dshfs-updateLine{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".dshfs-version{color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}",
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
    const NS = "free-search";
    const I18N = {
      zh: {
        description: "免费搜索 —— 无需 API key（Bing / DuckDuckGo / AnySearch / Exa / Tavily / Keenable）",
        unsaved: "未保存",
        searchEngine: "搜索引擎",
        visit: "访问官网 →",
        getKey: "获取 API Key →",
        engineHint: "Bing 是最稳定的免费引擎。DuckDuckGo 在共享 IP 上可能限流。API KEY 引擎需在下方填写凭据。",
        apiKeys: "API 密钥（可选）",
        exaPh: (c) => c ? "Exa API 密钥（已配置）" : "Exa API 密钥（可选，不填也可免费使用）",
        tavilyPh: (c) => c ? "Tavily API 密钥（已配置）" : "Tavily API 密钥（可选，不填也可免费使用）",
        keenablePh: (c) => c ? "Keenable API 密钥（已配置）" : "Keenable API 密钥（可选，不填也可免费使用）",
        perplexityPh: (c) => c ? "Perplexity API 密钥（已配置）" : "Perplexity API 密钥（pplx-...）",
        deepseekPh: (c) => c ? "DeepSeek API 密钥（已配置）" : "DeepSeek API 密钥（sk-...）",
        keysHint: "密钥保存在 settings.yaml（界面脱敏显示）。为某引擎填写密钥后即可使用。",
        platformSearch: "平台搜索（platform_search 工具）",
        platformHint: "为 agent 的 platform_search 工具启用平台。禁用的平台会被跳过。",
        cacheTtl: "结果缓存时长（分钟）",
        cacheTtlHint: "0 关闭缓存，最长 5 分钟。缩短可加快时效，延长可防限流、省额度。",
        unavailable: "设置不可用 —— free-search 桥接未暴露。",
        saveFailed: "保存失败",
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
      },
      en: {
        description: "Free web search — no API key needed (Bing / DuckDuckGo / AnySearch / Exa / Tavily / Keenable)",
        unsaved: "unsaved",
        searchEngine: "Search engine",
        visit: "Visit website →",
        getKey: "Get API Key →",
        engineHint: "Bing is the most stable FREE engine. DuckDuckGo may rate-limit on shared IPs. API KEY engines need credentials below.",
        apiKeys: "API keys (optional)",
        exaPh: (c) => c ? "Exa API key (configured)" : "Exa API key (optional, free without)",
        tavilyPh: (c) => c ? "Tavily API key (configured)" : "Tavily API key (optional, free without)",
        keenablePh: (c) => c ? "Keenable API key (configured)" : "Keenable API key (optional, free without)",
        perplexityPh: (c) => c ? "Perplexity API key (configured)" : "Perplexity API key (pplx-...)",
        deepseekPh: (c) => c ? "DeepSeek API key (configured)" : "DeepSeek API key (sk-...)",
        keysHint: "Keys are stored in settings.yaml (redacted in the UI). Enter a key for an engine to use it.",
        platformSearch: "Platform search (platform_search tool)",
        platformHint: "Enable platforms for the agent's platform_search tool. Disabled platforms are skipped.",
        cacheTtl: "Result cache TTL (minutes)",
        cacheTtlHint: "0 disables caching, max 5 minutes. Lower = fresher results, higher = less rate-limiting / fewer credits used.",
        unavailable: "Settings unavailable — the free-search bridge is not exposed.",
        saveFailed: "save failed",
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
        updateLatest: (c) => `You are up to date (v${c})`,
        updateCheckFailed: "Update check failed (cannot reach npm registry)",
        updateView: "View →",
      },
    };
    const tt = (lang) => I18N[lang === "en" ? "en" : "zh"];
    // 当前插件版本（与 lib/index.js 的 PLUGIN_VERSION 保持一致）
    const PLUGIN_VERSION = "0.4.10";
    const ENGINES = [
      { id: "ddg", label: "DuckDuckGo · HTML", badge: "FREE", link: "https://duckduckgo.com" },
      { id: "ddg-lite", label: "DuckDuckGo · Lite", badge: "FREE", link: "https://duckduckgo.com" },
      { id: "bing", label: "Bing", badge: "FREE", link: "https://www.bing.com" },
      { id: "anysearch", label: "AnySearch · AI", badge: "FREE", link: "https://anysearch.com" },
      { id: "searxng", label: "SearXNG · 元搜索", badge: "FREE", link: "https://github.com/searxng/searxng" },
      { id: "exa", label: "Exa", badge: "FREE", link: "https://dashboard.exa.ai/api-keys" },
      { id: "tavily", label: "Tavily", badge: "FREE", link: "https://app.tavily.com/home" },
      { id: "keenable", label: "Keenable", badge: "FREE", link: "https://keenable.ai/login" },
      { id: "perplexity", label: "Perplexity", badge: "API KEY", link: "https://www.perplexity.ai/settings/api" },
      { id: "deepseek-official", label: "DeepSeek Official", badge: "API KEY", link: "https://platform.deepseek.com/api_keys" },
    ];

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

    function FreeSearchCard(props) {
      const [open, setOpen] = react.useState(false);
      const [state, setState] = react.useState({ status: "loading" });
      const [provider, setProvider] = react.useState("bing");
      const [exaKey, setExaKey] = react.useState("");
      const [tavilyKey, setTavilyKey] = react.useState("");
      const [keenableKey, setKeenableKey] = react.useState("");
      const [perplexityKey, setPerplexityKey] = react.useState("");
      const [deepseekKey, setDeepseekKey] = react.useState("");
      const [platforms, setPlatforms] = react.useState(["github", "v2ex", "bilibili", "reddit"]);
      const [cacheTtl, setCacheTtl] = react.useState(5);
      const [keysConfigured, setKeysConfigured] = react.useState({});
      const [lang, setLang] = react.useState("zh");
      const [dirty, setDirty] = react.useState(false);
      const [saving, setSaving] = react.useState(false);
      const [failed, setFailed] = react.useState(false);
      const [testing, setTesting] = react.useState(false);
      const [testResult, setTestResult] = react.useState(null);
      const [checkingUpdate, setCheckingUpdate] = react.useState(false);
      const [updateInfo, setUpdateInfo] = react.useState(null);

      const load = react.useCallback(async () => {
        try {
          const result = await bridgeDescribe();
          if (result.ok) {
            const view = result.value.namespaces.find((n) => n.ns === NS);
            if (view) {
              const v = view.value ?? {};
              setProvider(v.provider ?? "ddg");
              setLang(v.lang === "en" ? "en" : "zh");
              setExaKey(v.exaApiKey ?? "");
              setTavilyKey(v.tavilyApiKey ?? "");
              setKeenableKey(v.keenableApiKey ?? "");
              setPerplexityKey(v.perplexityApiKey ?? "");
              setDeepseekKey(v.deepseekApiKey ?? "");
              setPlatforms(Array.isArray(v.platforms) && v.platforms.length > 0 ? v.platforms : ["github", "v2ex", "bilibili", "reddit"]);
              setCacheTtl(v.cacheTtl === undefined ? 5 : Math.min(Math.max(Number(v.cacheTtl) ?? 5, 0), 5));
              // secrets 字段标记哪些 key 已配置（值被脱敏，仅显示"已配置"）
              const configured = {};
              for (const secret of view.secrets ?? []) {
                if (secret.set) {
                  const path = secret.path.join(".");
                  if (path === "exaApiKey") configured.exa = true;
                  if (path === "tavilyApiKey") configured.tavily = true;
                  if (path === "keenableApiKey") configured.keenable = true;
                  if (path === "perplexityApiKey") configured.perplexity = true;
                  if (path === "deepseekApiKey") configured.deepseek = true;
                }
              }
              setKeysConfigured(configured);
              setState({ status: "ready", writable: result.value.writable });
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
      };

      const save = async () => {
        setSaving(true);
        setFailed(false);
        try {
          const ops = [{ op: "set", path: ["provider"], value: provider }];
          ops.push({ op: "set", path: ["lang"], value: lang });
          if (exaKey.trim()) ops.push({ op: "set", path: ["exaApiKey"], value: exaKey.trim() });
          if (tavilyKey.trim()) ops.push({ op: "set", path: ["tavilyApiKey"], value: tavilyKey.trim() });
          if (keenableKey.trim()) ops.push({ op: "set", path: ["keenableApiKey"], value: keenableKey.trim() });
          if (perplexityKey.trim()) ops.push({ op: "set", path: ["perplexityApiKey"], value: perplexityKey.trim() });
          if (deepseekKey.trim()) ops.push({ op: "set", path: ["deepseekApiKey"], value: deepseekKey.trim() });
          ops.push({ op: "set", path: ["platforms"], value: platforms });
          ops.push({ op: "set", path: ["cacheTtl"], value: Math.min(Math.max(Number(cacheTtl) ?? 5, 0), 5) });
          const result = await bridgeMutate({ ns: NS, ops });
          if (result.ok) {
            setDirty(false);
            setProvider(result.value.value.provider ?? provider);
            setFailed(false);
            load();
          } else {
            setFailed(true);
          }
        } catch {
          setFailed(true);
        } finally {
          setSaving(false);
        }
      };

      const discard = () => {
        load();
        setDirty(false);
        setFailed(false);
      };

      const runTest = async () => {
        setTesting(true);
        setTestResult(null);
        setFailed(false);
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
              engine: result.value.provider ?? provider,
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

      if (state.status === "loading") return null;
      const ready = state.status === "ready";
      const t = tt(lang);
      const title = "Free Search";
      const description = t.description;
      const currentEngine = ENGINES.find((e) => e.id === provider) ?? ENGINES[0];
      const badgeClass =
        currentEngine.badge === "FREE" ? "dshfs-badge dshfs-badgeFree" : "dshfs-badge dshfs-badgeKey";

      const toggleLang = () => {
        setLang((prev) => (prev === "en" ? "zh" : "en"));
        setDirty(true);
        setFailed(false);
      };

      return react_jsx_runtime.jsx("li", {
        className: open ? "dshfs-card dshfs-cardOpen" : "dshfs-card",
        children: [
          react_jsx_runtime.jsx("button", {
            type: "button",
            className: "dshfs-header",
            "aria-expanded": open,
            onClick: () => setOpen(!open),
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
                        disabled: !ready || saving,
                        onChange: (e) => select(e.target.value),
                        children: ENGINES.map((engine) =>
                          react_jsx_runtime.jsx("option", { value: engine.id, children: `${engine.label} (${engine.badge})` }, engine.id)
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
                        children: t.apiKeys,
                      }),
                      react_jsx_runtime.jsx("input", {
                        className: "dshfs-input",
                        type: "password",
                        placeholder: t.exaPh(keysConfigured.exa),
                        value: exaKey,
                        disabled: !ready || saving,
                        onChange: (e) => {
                          setExaKey(e.target.value);
                          setDirty(true);
                          setFailed(false);
                        },
                      }),
                      react_jsx_runtime.jsx("input", {
                        className: "dshfs-input",
                        type: "password",
                        placeholder: t.tavilyPh(keysConfigured.tavily),
                        value: tavilyKey,
                        disabled: !ready || saving,
                        onChange: (e) => {
                          setTavilyKey(e.target.value);
                          setDirty(true);
                          setFailed(false);
                        },
                      }),
                      react_jsx_runtime.jsx("input", {
                        className: "dshfs-input",
                        type: "password",
                        placeholder: t.keenablePh(keysConfigured.keenable),
                        value: keenableKey,
                        disabled: !ready || saving,
                        onChange: (e) => {
                          setKeenableKey(e.target.value);
                          setDirty(true);
                          setFailed(false);
                        },
                      }),
                      react_jsx_runtime.jsx("input", {
                        className: "dshfs-input",
                        type: "password",
                        placeholder: t.perplexityPh(keysConfigured.perplexity),
                        value: perplexityKey,
                        disabled: !ready || saving,
                        onChange: (e) => {
                          setPerplexityKey(e.target.value);
                          setDirty(true);
                          setFailed(false);
                        },
                      }),
                      react_jsx_runtime.jsx("input", {
                        className: "dshfs-input",
                        type: "password",
                        placeholder: t.deepseekPh(keysConfigured.deepseek),
                        value: deepseekKey,
                        disabled: !ready || saving,
                        onChange: (e) => {
                          setDeepseekKey(e.target.value);
                          setDirty(true);
                          setFailed(false);
                        },
                      }),
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: t.keysHint,
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
                      failed ? react_jsx_runtime.jsx("span", { className: "dshfs-failed", children: t.saveFailed }) : null,
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
                          react_jsx_runtime.jsx("button", {
                            className: "dshfs-btn",
                            type: "button",
                            onClick: runCheckUpdate,
                            disabled: checkingUpdate || saving || !ready,
                            children: checkingUpdate ? t.checkingUpdate : t.checkUpdate,
                          }),
                          updateInfo && updateInfo.ok
                            ? updateInfo.hasUpdate
                              ? react_jsx_runtime.jsx("span", {
                                  className: "dshfs-update",
                                  children: [
                                    t.updateAvailable(updateInfo.current, updateInfo.latest),
                                    " ",
                                    react_jsx_runtime.jsx("a", {
                                      className: "dshfs-link",
                                      href: updateInfo.updateUrl,
                                      target: "_blank",
                                      rel: "noopener noreferrer",
                                      children: t.updateView,
                                    }),
                                  ],
                                })
                              : react_jsx_runtime.jsx("span", {
                                  className: "dshfs-updateOk",
                                  children: t.updateLatest(updateInfo.current),
                                })
                            : updateInfo && !updateInfo.ok
                              ? react_jsx_runtime.jsx("span", {
                                  className: "dshfs-failed",
                                  children: t.updateCheckFailed,
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
                        },
                        disabled: saving || !ready || provider === "bing",
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
      // 挂官方插槽 settings.plugin.item（设置 → 插件 → 可配置标签页）。
      // 不依赖 dsh-web-ui：配置读写走自建 bridge（/api/dsh-free-search-settings）。
      ctx.slots.inject("settings.plugin.item", () =>
        ctx.slots.register(
          {
            name: "settings.plugin.item",
            key: "free-search",
            id: "dsh-free-search",
            order: 120,
            inject: () => ({}),
          },
          FreeSearchCard
        )
      );
      // /free-search-engine 弹出式命令：输入 "/" 选中后弹出引擎列表，点选即切换。
      // 等效于设置页切换引擎+保存；命令只改 provider 配置，搜索仍走回退链。
      ctx.inject(["commandUi"], (sctx) => {
        const command = sctx.get("commandUi");
        sctx.effect(() => {
          const dispose = command.register({
            name: "free-search-engine",
            description: "切换搜索引擎 / Switch web search engine",
            available: () => true,
            ui: {
              kind: "popupSelect",
              options: async () => {
                const result = await bridgeDescribe();
                const view = result.ok ? result.value.namespaces.find((n) => n.ns === NS) : undefined;
                const current = view?.value?.provider ?? "bing";
                return ENGINES.map((e) => ({
                  id: e.id,
                  label: `${e.label}${e.badge === "FREE" ? " · 免费" : " · API Key"}`,
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
