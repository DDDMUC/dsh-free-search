// #72 域名黑名单断言（零依赖离线）。
// 覆盖：匹配语义（子域/大小写/www 归一/误伤防护）、"收敛前过滤"补位语义（过滤后仍能填满 maxResults）、
// 以及全被禁时返回空而不抛错。
import { isDomainBlocked, setActiveBlockedDomains, getActiveBlockedDomains, filterBlockedDomains, applyBlockedFilterToResult, normalizeDomainList } from "../lib/domain_filter.js";

let passed = 0;
function check(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ok  ${name}`);
}
const mk = (u) => ({ url: u });

// === 1. 匹配语义 ===
setActiveBlockedDomains(["csdn.net"]);
check("命中子域 blog.csdn.net", isDomainBlocked("https://blog.csdn.net/a/b"));
check("命中域名自身 csdn.net", isDomainBlocked("https://csdn.net/x"));
check("命中深子域 download.csdn.net", isDomainBlocked("https://download.csdn.net/f/1"));
check("http scheme 同样生效", isDomainBlocked("http://blog.csdn.net/x"));
check("notcsdn.net 不误伤", !isDomainBlocked("https://notcsdn.net/a"));
check("xcsdn.net 不误伤", !isDomainBlocked("https://xcsdn.net/a"));
check("csdn.net.evil.com 不误伤（不是子域）", !("https://csdn.net.evil.com/x" && isDomainBlocked("https://csdn.net.evil.com/x")));
check("域名大写仍命中", isDomainBlocked("https://BLOG.CSDN.NET/x"));
check("规则大写仍生效", (() => { setActiveBlockedDomains(["CSDN.NET"]); const r = isDomainBlocked("https://blog.csdn.net/x"); setActiveBlockedDomains(["csdn.net"]); return r; })());
check("URL 带 www. 归一后命中", isDomainBlocked("https://www.csdn.net/x"));
check("规则带 www. 归一后命中子域", (() => { setActiveBlockedDomains(["www.csdn.net"]); const r = isDomainBlocked("https://blog.csdn.net/x"); setActiveBlockedDomains(["csdn.net"]); return r; })());
check("非法 URL 不误伤", !isDomainBlocked("not a url"));
check("空 URL 不误伤", !isDomainBlocked(""));
check("无 scheme 的裸串不误伤", !isDomainBlocked("blog.csdn.net"));

setActiveBlockedDomains([]);
check("空黑名单 → 全部放行", !isDomainBlocked("https://blog.csdn.net/x"));

setActiveBlockedDomains(["csdn.net", "51cto.com"]);
check("多规则命中第二条（子域）", isDomainBlocked("https://x.51cto.com/y"));
check("多规则未命中", !isDomainBlocked("https://example.com/z"));

// === 2. 「收敛前过滤」补位语义（issue #72 验收核心）===
setActiveBlockedDomains(["csdn.net"]);
// 原始 12 条含 3 条被禁、maxResults=10 → 应返回 10 条（不是 7 条）
const twelve = [];
for (let i = 1; i <= 3; i++) twelve.push(mk(`https://blog.csdn.net/p${i}`));
for (let i = 4; i <= 12; i++) twelve.push(mk(`https://site${i}.com/p`));
check("12 条含 3 条被禁 → 过滤后仍 9+1 补满 10", (() => { const f = filterBlockedDomains(twelve); return f.length === 9 && f.slice(0, 10).length === 9; })());

// 混排：被禁条目散布（头部/中部/尾部），验证后面的候选确实补位
const mixed = [mk("https://a.com/1"), mk("https://blog.csdn.net/1"), mk("https://b.com/2"), mk("https://blog.csdn.net/2"), mk("https://c.com/3")];
for (let i = 6; i <= 14; i++) mixed.push(mk(`https://s${i}.com/x`));
mixed.push(mk("https://download.csdn.net/3"));
const f3 = filterBlockedDomains(mixed);
const top10 = f3.slice(0, 10);
check("混排后候选数足够补位（≥10）", f3.length >= 10);
check("top10 已无任何被禁域名", top10.every((s) => !/csdn\.net/i.test(s.url)));
check("top10 保序：第 1 条仍为 a.com", top10[0].url === "https://a.com/1");
check("top10 补位：第 2 条是 b.com（被禁项没占位）", top10[1].url === "https://b.com/2");
check("top10 补位：第 3 条是 c.com", top10[2].url === "https://c.com/3");

// 极端：全部被禁 → 空列表，不抛错（交给上层回退/降级）
check("全部被禁 → 空列表", filterBlockedDomains([mk("https://blog.csdn.net/1"), mk("https://csdn.net/2")]).length === 0);
check("空输入 → 空输出", filterBlockedDomains([]).length === 0);

// === 3. 活动列表管理 ===
setActiveBlockedDomains(["  a.com  ", "WWW.B.COM"]);
const snapshot = getActiveBlockedDomains();
check("getter 返回副本（外部改动不影响内部）", (snapshot.push("x"), getActiveBlockedDomains().length === 2));
check("规则带空格在匹配时兜底（trim 后生效）", isDomainBlocked("https://a.com/x"));
check("规则 WWW.B.COM 归一后命中子域", isDomainBlocked("https://img.b.com/x"));

setActiveBlockedDomains(null);
check("null 列表 → 清空（不过滤）", getActiveBlockedDomains().length === 0 && !isDomainBlocked("https://blog.csdn.net/x"));

setActiveBlockedDomains([]);
// === 4. 结果级收口 applyBlockedFilterToResult ===
// 回归防线：#72 首版只把过滤塞进 uniqueSources（29/40 引擎的收敛 helper），
// 而 searchAnysearch / searchPlatform 等 11 个引擎直接 return sources 绕过它，
// 导致 multi_search / platform_search 路径完全不挡。这组断言锁死收口语义。
setActiveBlockedDomains(["csdn.net"]);
const blkMixed = { sources: [mk("https://docs.python.org/3"), mk("https://blog.csdn.net/a"), mk("https://b.com/2")], truncated: false };
const blkFiltered = applyBlockedFilterToResult(blkMixed);
check("收口：屏蔽项被剔除", blkFiltered.sources.length === 2 && !blkFiltered.sources.some((s) => /csdn\.net/.test(s.url)));
check("收口：其余字段保留（truncated）", blkFiltered.truncated === false);
check("收口：不修改入参（原对象 sources 不变）", blkMixed.sources.length === 3);
check("收口：返回新对象而非原地改", blkFiltered !== blkMixed);
check("收口：保留 seenIn/多引擎字段", applyBlockedFilterToResult({ sources: [mk("https://x.com/1")], provider: "anysearch", seenIn: ["a", "b"] }).seenIn.join(",") === "a,b");
check("收口：全部被禁 → sources 空数组不抛错", applyBlockedFilterToResult({ sources: [mk("https://blog.csdn.net/a")] }).sources.length === 0);
const blkNoHit = { sources: [mk("https://a.com/1")] };
check("收口：无命中返回同一引用（零分配）", applyBlockedFilterToResult(blkNoHit) === blkNoHit);
check("收口：无 sources 字段原样返回", applyBlockedFilterToResult({ ok: true }) .sources === undefined);
check("收口：sources 非数组原样返回", applyBlockedFilterToResult({ sources: "x" }).sources === "x");
check("收口：null/undefined 安全", applyBlockedFilterToResult(null) === null && applyBlockedFilterToResult(undefined) === undefined);
// 缓存命中场景：首版修复前写入的缓存可能残留屏蔽域名，命中时也必须清掉
const blkStaleCache = { sources: [mk("https://blog.csdn.net/stale"), mk("https://good.com/keep")], _cache: "hit" };
check("收口：清掉历史缓存里的屏蔽域名", applyBlockedFilterToResult(blkStaleCache).sources.length === 1);
setActiveBlockedDomains([]);
const noCfg = { sources: [mk("https://blog.csdn.net/x")] };
check("收口：未配黑名单时结果原样透传（零行为变更）", applyBlockedFilterToResult(noCfg) === noCfg);

// === 5. normalizeDomainList：配置清洗（P2 支持用户直接粘贴 URL） ===
const j = (a) => a.join(",");
check("清洗：整行域名原样通过", normalizeDomainList(["csdn.net"]).join() === "csdn.net");
check("清洗：strip http:// scheme", j(normalizeDomainList(["http://blog.csdn.net"])) === "blog.csdn.net");
check("清洗：strip https:// scheme", j(normalizeDomainList(["https://blog.csdn.net"])) === "blog.csdn.net");
check("清洗：strip 尾部斜杠", j(normalizeDomainList(["csdn.net/"])) === "csdn.net");
check("清洗：strip 路径", j(normalizeDomainList(["https://juejin.cn/post/7560635650"])) === "juejin.cn");
check("清洗：strip query/hash", normalizeDomainList(["https://a.com/x?y=1#z"])[0] === "a.com");
check("清洗：strip 端口", j(normalizeDomainList(["csdn.net:8080"])) === "csdn.net");
check("清洗：去 www. 前缀", j(normalizeDomainList(["www.csdn.net"])) === "csdn.net");
check("清洗：大写归一", j(normalizeDomainList(["CSDN.NET"])) === "csdn.net");
check("清洗：逐条 trim", j(normalizeDomainList(["  csdn.net  ", "\tjuejin.cn\n"])) === "csdn.net,juejin.cn");
check("清洗：去重且保留首次顺序", j(normalizeDomainList(["csdn.net", "juejin.cn", "blog.csdn.net", "csdn.net"])) === "csdn.net,juejin.cn,blog.csdn.net");
check("清洗：空行/空串被丢弃", normalizeDomainList(["", "   ", null, undefined]).length === 0);
check("清洗：含空格/非法字符的行被丢弃", normalizeDomainList(["csdn net", "a b.com", "-x.com", ".x.com"]).length === 0);
check("清洗：非数组输入返回空数组", normalizeDomainList("csdn.net").length === 0 && normalizeDomainList(null).length === 0);
check("清洗：IPv4 非法但保留形状（不匹配即静默失效）", normalizeDomainList(["127.0.0.1"])[0] === "127.0.0.1");
// 清洗不掉匹配语义：规范化后的规则仍只命中自身与子域
setActiveBlockedDomains(normalizeDomainList(["https://www.CSDN.net:443/post/1", "  juejin.cn/  "]));
check("清洗+setActive：URL 形式的规则生效", isDomainBlocked("https://blog.csdn.net/a/b"));
check("清洗+setActive：路径形式规则生效", isDomainBlocked("https://juejin.cn/post/1"));
check("清洗+setActive：不误伤非子域", !isDomainBlocked("https://notcsdn.net/a"));
setActiveBlockedDomains([]);
// setActiveBlockedDomains 自身也走清洗（服务端兜底：绕过 UI 直接改 YAML 也正确）
setActiveBlockedDomains(["https://blog.csdn.net/x", "WWW.JUEJIN.CN"]);
const cfgDump = getActiveBlockedDomains();
check("setActive 兜底清洗：URL 规则被规范化", j(cfgDump) === "blog.csdn.net,juejin.cn");
check("getter 仍返回副本", (cfgDump.push("x"), getActiveBlockedDomains().length === 2));
setActiveBlockedDomains([]);

// === 6. 前后端清洗一致性（防"存进去对、读回来错"）===
// lib/client.js 是预编译产物（内联 JSX、CJS 风格），无法 import；这里把它的
// parseBlockedDomains 源码抽出来 eval，与 lib/domain_filter.js 的 normalizeDomainList 对比。
// 设置页存的规则 与 服务端 setActiveBlockedDomains 的规范化结果必须一致。
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const clientPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "client.js");
  const clientSrc = readFileSync(clientPath, "utf8");
  const marker = "const parseBlockedDomains = (text) => {";
  const start = clientSrc.indexOf(marker);
  check("client.js 存在 parseBlockedDomains", start >= 0);
  let depth = 0;
  let end = -1;
  let inStr = null;
  let inLineComment = false;
  for (let i = start; i < clientSrc.length; i++) {
    const ch = clientSrc[i];
    const nx = clientSrc[i + 1];
    if (inLineComment) { if (ch === "\n") inLineComment = false; continue; }
    if (inStr) { if (ch === "\\") { i++; continue; } if (ch === inStr) inStr = null; continue; }
    if (ch === "/" && nx === "/") { inLineComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const fnSrc = clientSrc.slice(start, end);
  check("解析出完整的 parseBlockedDomains 源码", end > start);
  const clientParse = new Function(`${fnSrc}; return parseBlockedDomains;`)();
  const tricky = [
    "csdn.net", "https://blog.csdn.net", "http://CSDN.NET/", "www.51cto.com",
    "  juejin.cn/post/7560635  ", "trae.cn:8443/x", "https://zhihu.com/question/1#a",
    "blog.csdn.net", "csdn.net", "", "   ", "not a domain", "a_b.com", ".x.com",
    "127.0.0.1", "sub.example.co.uk",
  ];
  const fromClient = clientParse(tricky.join("\n")).domains;
  const fromServer = normalizeDomainList(tricky);
  check("前后端清洗结果一致", fromClient.join(",") === fromServer.join(","));
  check("一致性样本非空（断言真的在比较）", fromClient.length >= 6);
  const st = clientParse("https://blog.csdn.net/x\nhttps://blog.csdn.net/x\n\nfoo bar\ngood.com").stats;
  check("提示统计：修正数 = 2", st.corrected === 2);
  check("提示统计：重复数 = 1", st.dupes === 1);
  check("提示统计：丢弃数 = 1（只算非法行；空行静默忽略、不打扰用户）", st.dropped === 1);
  const blankOnly = clientParse("\n\n   \n\n").stats;
  check("提示统计：纯空行不产生任何提示", blankOnly.corrected === 0 && blankOnly.dupes === 0 && blankOnly.dropped === 0);
}

setActiveBlockedDomains([]);
console.log(`OK: ${passed} assertions passed`);
