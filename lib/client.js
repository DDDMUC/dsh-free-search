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
      // 涓嬫媺閫夐」鍒楄〃閰嶈壊閿佹锛氫笉闅忕毊鑲ゅ彉閲忓彉鍖栵紙鐨偆鍙奖鍝?select 妗嗕綋鏈韩锛?
      // color-scheme 璁╂祻瑙堝櫒鍘熺敓涓嬫媺鎸変富棰樻覆鏌擄紱option 鏄惧紡鍥哄畾搴曡壊/鏂囧瓧鑹插厹搴?
      ".dshfs-select{color-scheme:light dark}",
      ".dshfs-select option,.dshfs-select optgroup{background-color:#ffffff;color:#1f2328}",
      "@media (prefers-color-scheme:dark){.dshfs-select{color-scheme:dark}.dshfs-select option,.dshfs-select optgroup{background-color:#1e1f24;color:#e8e8ea}}",
      ".dshfs-input{border:1px solid var(--dsw-alias-border-l2);font:inherit;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border-radius:6px;padding:6px 8px;font-size:13px;transition:border-color .13s,box-shadow .13s;width:100%}",
      ".dshfs-ttl{width:88px}",
      ".dshfs-fieldRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".dshfs-keyStorage{width:auto;min-width:180px}",
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
      ".dshfs-upgrade{border:1px solid rgba(80,200,120,.4);background:rgba(80,200,120,.15);color:#7ddb9c}",
      ".dshfs-upgrade:hover:not(:disabled){background:rgba(80,200,120,.28)}",
      ".dshfs-upgrade:disabled{opacity:.5;cursor:default}",
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
        description: "鍏嶈垂鎼滅储 鈥斺€?鏃犻渶 API key锛圔ing / DuckDuckGo / AnySearch / Exa / Tavily / Keenable锛?,
        unsaved: "鏈繚瀛?,
        searchEngine: "鎼滅储寮曟搸",
        visit: "璁块棶瀹樼綉 鈫?,
        getKey: "鑾峰彇 API Key 鈫?,
        engineHint: "Bing 鏄渶绋冲畾鐨勫厤璐瑰紩鎿庛€侱uckDuckGo 鍦ㄥ叡浜?IP 涓婂彲鑳介檺娴併€侫PI KEY 寮曟搸闇€鍦ㄤ笅鏂瑰～鍐欏嚟鎹€?,
        apiKeys: "API 瀵嗛挜锛堝彲閫夛級",
        exaPh: (c) => c ? "Exa API 瀵嗛挜锛堝凡閰嶇疆锛? : "Exa API 瀵嗛挜锛堝彲閫夛紝涓嶅～涔熷彲鍏嶈垂浣跨敤锛?,
        tavilyPh: (c) => c ? "Tavily API 瀵嗛挜锛堝凡閰嶇疆锛? : "Tavily API 瀵嗛挜锛堝彲閫夛紝涓嶅～涔熷彲鍏嶈垂浣跨敤锛?,
        keenablePh: (c) => c ? "Keenable API 瀵嗛挜锛堝凡閰嶇疆锛? : "Keenable API 瀵嗛挜锛堝彲閫夛紝涓嶅～涔熷彲鍏嶈垂浣跨敤锛?,
        perplexityPh: (c) => c ? "Perplexity API 瀵嗛挜锛堝凡閰嶇疆锛? : "Perplexity API 瀵嗛挜锛坧plx-...锛?,
        deepseekPh: (c) => c ? "DeepSeek API 瀵嗛挜锛堝凡閰嶇疆锛? : "DeepSeek API 瀵嗛挜锛坰k-...锛?,
        keysHint: "瀵嗛挜璇诲彇浼樺厛绾э細.credentials.yaml 鍑嵁涓績 > 杩欓噷 > 鐜鍙橀噺銆傛帹鑽愭妸 key 鍐欒繘鍑嵁涓績锛堜笌瀹樻柟 LLM 涓€鑷达紝涓€澶勭鐞嗭級銆?,
        keyStorage: "Key 瀛樺偍浣嶇疆",
        keyStorageCred: "鍑嵁涓績锛堟帹鑽愶級",
        keyStorageSettings: "璁剧疆椤碉紙鍏煎锛?,
        keyStorageCredHint: (c) => `淇濆瓨鍚庡啓鍏?~/.dsh/.credentials.yaml锛堟渶楂樹紭鍏堢骇锛夈€傚綋鍓嶅凡閰嶇疆锛?{["exa", "tavily", "keenable", "perplexity", "deepseek"].filter((k) => c[k]).map((k) => k.toUpperCase()).join(", ") || "鏃?}`,
        keyStorageSettingsHint: "淇濆瓨鍚庡啓鍏?settings.yaml锛堝悜鍚庡吋瀹硅矾寰勶紝浼樺厛绾т綆浜庡嚟鎹腑蹇冿級銆?,
        platformSearch: "骞冲彴鎼滅储锛坧latform_search 宸ュ叿锛?,
        platformHint: "涓?agent 鐨?platform_search 宸ュ叿鍚敤骞冲彴銆傜鐢ㄧ殑骞冲彴浼氳璺宠繃銆?,
        cacheTtl: "缁撴灉缂撳瓨鏃堕暱锛堝垎閽燂級",
        cacheTtlHint: "0 鍏抽棴缂撳瓨锛屾渶闀?5 鍒嗛挓銆傜缉鐭彲鍔犲揩鏃舵晥锛屽欢闀垮彲闃查檺娴併€佺渷棰濆害銆?,
        unavailable: "璁剧疆涓嶅彲鐢?鈥斺€?free-search 妗ユ帴鏈毚闇层€?,
        saveFailed: "淇濆瓨澶辫触",
        testing: "娴嬭瘯涓€?,
        testEngine: "娴嬭瘯寮曟搸",
        useBing: "鎭㈠ Bing 榛樿",
        discard: "鎾ら攢",
        saving: "淇濆瓨涓€?,
        save: "淇濆瓨",
        testOk: (r) => `鉁?${r.count} 鏉＄粨鏋滐紙寮曟搸: ${r.engine}锛?{r.content ? ` 鈥?${r.content}` : ""}${r.sample ? ` 路 渚嬪 "${r.sample.slice(0, 40)}"` : ""}`,
        testFail: (e) => `鉁?${e}`,
        toggleLang: "EN",
        checkUpdate: "妫€鏌ユ洿鏂?,
        checkingUpdate: "妫€鏌ヤ腑鈥?,
        updateAvailable: (c, l) => `鍙戠幇鏂扮増鏈?v${l}锛堝綋鍓?v${c}锛塦,
        updateLatest: (c) => `宸叉槸鏈€鏂扮増鏈?v${c}`,
        updateCheckFailed: "妫€鏌ユ洿鏂板け璐ワ紙鏃犳硶璁块棶 npm registry锛?,
        updateView: "鏌ョ湅 鈫?,
        upgrade: "鍗囩骇",
        upgrading: "鍗囩骇涓€?,
        upgradeLinkMode: "锛堟湰鍦板紑鍙戞ā寮忥紝鍗囩骇璇风敤 git pull锛?,
        upgradeDone: (l) => `鍗囩骇鍒?v${l} 瀹屾垚锛岄噸鍚?dsh 鍚庣敓鏁坄,
        upgradeFailed: (m) => `鍗囩骇澶辫触锛?{m}`,
      },
      en: {
        description: "Free web search 鈥?no API key needed (Bing / DuckDuckGo / AnySearch / Exa / Tavily / Keenable)",
        unsaved: "unsaved",
        searchEngine: "Search engine",
        visit: "Visit website 鈫?,
        getKey: "Get API Key 鈫?,
        engineHint: "Bing is the most stable FREE engine. DuckDuckGo may rate-limit on shared IPs. API KEY engines need credentials below.",
        apiKeys: "API keys (optional)",
        exaPh: (c) => c ? "Exa API key (configured)" : "Exa API key (optional, free without)",
        tavilyPh: (c) => c ? "Tavily API key (configured)" : "Tavily API key (optional, free without)",
        keenablePh: (c) => c ? "Keenable API key (configured)" : "Keenable API key (optional, free without)",
        perplexityPh: (c) => c ? "Perplexity API key (configured)" : "Perplexity API key (pplx-...)",
        deepseekPh: (c) => c ? "DeepSeek API key (configured)" : "DeepSeek API key (sk-...)",
        keysHint: "Key resolution: .credentials.yaml credential center > here > environment variables. Recommended: store keys in the credential center (same as official LLM providers, one place for all).",
        keyStorage: "Key storage",
        keyStorageCred: "Credential center (recommended)",
        keyStorageSettings: "Settings page (legacy)",
        keyStorageCredHint: (c) => `Saved to ~/.dsh/.credentials.yaml (highest priority). Currently configured: ${["exa", "tavily", "keenable", "perplexity", "deepseek"].filter((k) => c[k]).map((k) => k.toUpperCase()).join(", ") || "none"}`,
        keyStorageSettingsHint: "Saved to settings.yaml (backward-compatible path; lower priority than the credential center).",
        platformSearch: "Platform search (platform_search tool)",
        platformHint: "Enable platforms for the agent's platform_search tool. Disabled platforms are skipped.",
        cacheTtl: "Result cache TTL (minutes)",
        cacheTtlHint: "0 disables caching, max 5 minutes. Lower = fresher results, higher = less rate-limiting / fewer credits used.",
        unavailable: "Settings unavailable 鈥?the free-search bridge is not exposed.",
        saveFailed: "save failed",
        testing: "Testing鈥?,
        testEngine: "Test engine",
        useBing: "Use Bing default",
        discard: "Discard",
        saving: "Saving鈥?,
        save: "Save",
        testOk: (r) => `鉁?${r.count} results (engine: ${r.engine})${r.content ? ` 鈥?${r.content}` : ""}${r.sample ? ` 路 e.g. "${r.sample.slice(0, 40)}"` : ""}`,
        testFail: (e) => `鉁?${e}`,
        toggleLang: "涓枃",
        checkUpdate: "Check update",
        checkingUpdate: "Checking鈥?,
        updateAvailable: (c, l) => `New version v${l} available (current v${c})`,
        updateLatest: (c) => `You're on the latest version v${c}`,
        updateCheckFailed: "Update check failed (cannot reach npm registry)",
        updateView: "View 鈫?,
        upgrade: "Upgrade",
        upgrading: "Upgrading鈥?,
        upgradeLinkMode: "(local dev install - use git pull to update)",
        upgradeDone: (l) => `Upgraded to v${l} - restart dsh to apply`,
        upgradeFailed: (m) => `Upgrade failed: ${m}`,
      },
    };
    const tt = (lang) => I18N[lang === "en" ? "en" : "zh"];
    // 褰撳墠鎻掍欢鐗堟湰锛堜笌 lib/index.js 鐨?PLUGIN_VERSION 淇濇寔涓€鑷达級
    const PLUGIN_VERSION = "0.4.20";
    const ENGINES = [
      { id: "ddg", label: "DuckDuckGo 路 HTML", badge: "FREE", link: "https://duckduckgo.com" },
      { id: "ddg-lite", label: "DuckDuckGo 路 Lite", badge: "FREE", link: "https://duckduckgo.com" },
      { id: "bing", label: "Bing", badge: "FREE", link: "https://www.bing.com" },
      { id: "anysearch", label: "AnySearch 路 AI", badge: "FREE", link: "https://anysearch.com" },
      { id: "searxng", label: "SearXNG 路 鍏冩悳绱?, badge: "FREE", link: "https://github.com/searxng/searxng" },
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

    function FreeSearchCard(props) {
      // 妫€娴嬪簲鐢ㄤ富棰樻繁娴咃紙璇?body 鐨?--dsw-alias-bg-base 鍙橀噺浜害锛夛紝鐢ㄤ簬閿佸畾鍘熺敓涓嬫媺閰嶈壊
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
      const [open, setOpen] = react.useState(false);
      const [state, setState] = react.useState({ status: "loading" });
      const [provider, setProvider] = react.useState("bing");
      const [safeSearch, setSafeSearch] = react.useState("off");
      const [exaKey, setExaKey] = react.useState("");
      const [tavilyKey, setTavilyKey] = react.useState("");
      const [keenableKey, setKeenableKey] = react.useState("");
      const [perplexityKey, setPerplexityKey] = react.useState("");
      const [deepseekKey, setDeepseekKey] = react.useState("");
      const [platforms, setPlatforms] = react.useState(["github", "v2ex", "bilibili", "reddit", "hn", "stackoverflow", "wikipedia", "npm"]);
      const [cacheTtl, setCacheTtl] = react.useState(5);
      const [keysConfigured, setKeysConfigured] = react.useState({});
      // key 瀛樺偍浣嶇疆锛歝redentials锛堝嚟鎹腑蹇冿紝榛樿锛墊 settings锛堣缃〉锛屽吋瀹规棫琛屼负锛?
      const [keyStorage, setKeyStorage] = react.useState("credentials");
      // 鍑嵁涓績閲屽凡閰嶇疆鐨?key锛坉escribe 涓嶈繑鍥烇紝闇€鍗曠嫭鏌ワ級
      const [credConfigured, setCredConfigured] = react.useState({});
      const [lang, setLang] = react.useState("zh");
      const [dirty, setDirty] = react.useState(false);
      const [saving, setSaving] = react.useState(false);
      const [failed, setFailed] = react.useState(false);
      const [testing, setTesting] = react.useState(false);
      const [testResult, setTestResult] = react.useState(null);
      const [checkingUpdate, setCheckingUpdate] = react.useState(false);
      const [upgrading, setUpgrading] = react.useState(false);
      const [updateInfo, setUpdateInfo] = react.useState(null);

      const load = react.useCallback(async () => {
        try {
          const result = await bridgeDescribe();
          if (result.ok) {
            const view = result.value.namespaces.find((n) => n.ns === NS);
            if (view) {
              const v = view.value ?? {};
              setProvider(v.provider ?? "ddg");
              setSafeSearch(v.safeSearch === "strict" || v.safeSearch === "moderate" ? v.safeSearch : "off");
              setLang(v.lang === "en" ? "en" : "zh");
              setExaKey(v.exaApiKey ?? "");
              setTavilyKey(v.tavilyApiKey ?? "");
              setKeenableKey(v.keenableApiKey ?? "");
              setPerplexityKey(v.perplexityApiKey ?? "");
              setDeepseekKey(v.deepseekApiKey ?? "");
              setPlatforms(Array.isArray(v.platforms) && v.platforms.length > 0 ? v.platforms : ["github", "v2ex", "bilibili", "reddit", "hn", "stackoverflow", "wikipedia", "npm"]);
              setCacheTtl(v.cacheTtl === undefined ? 5 : Math.min(Math.max(Number(v.cacheTtl) ?? 5, 0), 5));
              // secrets 瀛楁鏍囪鍝簺 key 宸查厤缃紙鍊艰鑴辨晱锛屼粎鏄剧ず"宸查厤缃?锛?
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
              // key 瀛樺偍浣嶇疆锛堥粯璁ゅ嚟鎹腑蹇冿級
              setKeyStorage(v.keyStorage === "settings" ? "settings" : "credentials");
              setState({ status: "ready", writable: result.value.writable });
              // 鏌ヨ鍑嵁涓績閲屽悇 key 鐨勯厤缃姸鎬?
              try {
                const cred = await bridgeCredentialsStatus();
                if (cred.ok) {
                  const cc = {};
                  const map = { exaApiKey: "exa", tavilyApiKey: "tavily", keenableApiKey: "keenable", perplexityApiKey: "perplexity", deepseekApiKey: "deepseek" };
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
      };

      const save = async () => {
        setSaving(true);
        setFailed(false);
        try {
          // key 瀛樺偍鍒嗘祦锛氬嚟鎹腑蹇冿紙榛樿锛夎蛋 credentials-set锛涜缃〉璧?settings mutate锛堝吋瀹癸級
          const keyFields = [
            ["exaApiKey", exaKey],
            ["tavilyApiKey", tavilyKey],
            ["keenableApiKey", keenableKey],
            ["perplexityApiKey", perplexityKey],
            ["deepseekApiKey", deepseekKey],
          ];
          let credFailed = false;
          if (keyStorage === "credentials") {
            for (const [field, value] of keyFields) {
              if (!value.trim()) continue;
              const r = await bridgeCredentialsSet(field, value.trim());
              if (!r.ok) credFailed = true;
            }
          }
          const ops = [{ op: "set", path: ["provider"], value: provider }];
          ops.push({ op: "set", path: ["lang"], value: lang });
          ops.push({ op: "set", path: ["keyStorage"], value: keyStorage });
          ops.push({ op: "set", path: ["safeSearch"], value: safeSearch });
          if (keyStorage !== "credentials") {
            // settings 妯″紡锛歬ey 浠嶅啓 settings.yaml锛堟棫琛屼负锛?
            for (const [field, value] of keyFields) {
              if (value.trim()) ops.push({ op: "set", path: [field], value: value.trim() });
            }
          }
          ops.push({ op: "set", path: ["platforms"], value: platforms });
          ops.push({ op: "set", path: ["cacheTtl"], value: Math.min(Math.max(Number(cacheTtl) ?? 5, 0), 5) });
          const result = await bridgeMutate({ ns: NS, ops });
          if (result.ok && !credFailed) {
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

      const runUpdate = async () => {
        setUpgrading(true);
        setUpdateInfo(null);
        setFailed(false);
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
                children: "鈻?,
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
                        children: "Safe search filter (adlt)",
                      }),
                      react_jsx_runtime.jsx("select", {
                        className: "dshfs-select",
                        value: safeSearch,
                        style: { colorScheme: selectColorScheme },
                        disabled: !ready || saving,
                        onChange: (e) => setSafeSearch(e.target.value),
                        children: [
                          react_jsx_runtime.jsx("option", { value: "off", children: "Off - engine default (no filtering)" }, "off"),
                          react_jsx_runtime.jsx("option", { value: "moderate", children: "Moderate - Bing default" }, "moderate"),
                          react_jsx_runtime.jsx("option", { value: "strict", children: "Strict" }, "strict"),
                        ],
                      }),
                      react_jsx_runtime.jsx("p", {
                        className: "dshfs-hint",
                        children: "Applies to bing (adlt), ddg, ddg-lite (adlt degree). If you see the engine's own filtering, adjust here.",
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
                            ? updateInfo.upgraded
                              ? react_jsx_runtime.jsx("span", {
                                  className: "dshfs-updateOk",
                                  children: t.upgradeDone(updateInfo.latest),
                                })
                              : updateInfo.hasUpdate
                                ? react_jsx_runtime.jsx("span", {
                                    className: "dshfs-update",
                                    children: [
                                      t.updateAvailable(updateInfo.current, updateInfo.latest),
                                      " ",
                                      updateInfo.installable
                                        ? react_jsx_runtime.jsx("button", {
                                            className: "dshfs-btn dshfs-upgrade",
                                            type: "button",
                                            onClick: runUpdate,
                                            disabled: upgrading || saving || !ready,
                                            children: upgrading ? t.upgrading : t.upgrade,
                                          })
                                        : react_jsx_runtime.jsx("a", {
                                            className: "dshfs-link",
                                            href: updateInfo.updateUrl,
                                            target: "_blank",
                                            rel: "noopener noreferrer",
                                            children: t.updateView,
                                          }),
                                      updateInfo.installable ? null : " " + t.upgradeLinkMode,
                                    ],
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
      // 鎸傚畼鏂规彃妲?settings.plugin.item锛堣缃?鈫?鎻掍欢 鈫?鍙厤缃爣绛鹃〉锛夈€?
      // 涓嶄緷璧?dsh-web-ui锛氶厤缃鍐欒蛋鑷缓 bridge锛?api/dsh-free-search-settings锛夈€?
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
      // /free-search-engine 寮瑰嚭寮忓懡浠わ細杈撳叆 "/" 閫変腑鍚庡脊鍑哄紩鎿庡垪琛紝鐐归€夊嵆鍒囨崲銆?
      // 绛夋晥浜庤缃〉鍒囨崲寮曟搸+淇濆瓨锛涘懡浠ゅ彧鏀?provider 閰嶇疆锛屾悳绱粛璧板洖閫€閾俱€?
      ctx.inject(["commandUi"], (sctx) => {
        const command = sctx.get("commandUi");
        sctx.effect(() => {
          const dispose = command.register({
            name: "free-search-engine",
            description: "鍒囨崲鎼滅储寮曟搸 / Switch web search engine",
            available: () => true,
            ui: {
              kind: "popupSelect",
              options: async () => {
                const result = await bridgeDescribe();
                const view = result.ok ? result.value.namespaces.find((n) => n.ns === NS) : undefined;
                const current = view?.value?.provider ?? "bing";
                return ENGINES.map((e) => ({
                  id: e.id,
                  label: `${e.label}${e.badge === "FREE" ? " 路 鍏嶈垂" : " 路 API Key"}`,
                  detail: e.id === current ? (view?.value?.lang === "en" ? "current" : "褰撳墠") : undefined,
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
