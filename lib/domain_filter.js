// #72 域名黑名单：在结果进入上下文前过滤内容农场（CSDN 等）。
// 匹配语义（issue #72 约定）：
//   - 域名相等或其子域命中（csdn.net 覆盖 blog.csdn.net）
//   - 忽略大小写；www. 前缀归一；无 scheme / 无路径；
//   - 不做正则（notcsdn.net 不得被 csdn.net 命中）
// 生效方式：provider.search 入口按当次请求的 blockedDomains 设置"活动黑名单"，
// uniqueSources 在收敛（去重 + limit）之前过滤——被屏蔽条目让位给后续候选，
// 因此 maxResults 仍能填满，且 truncated 只在真正触及上限时为 true。

let active = [];
/**
 * 配置清洗：把用户随手填的域名/URL 归一成裸域名规则。
 * 处理 trim、scheme、路径/query/hash、端口、www.、大小写、去重（保序）、丢弃空值与非法行。
 *
 * 为什么要服务端兜底：blockedDomains 是 .volatile() 配置，用户可以直接编辑 YAML 绕过 UI，
 * 所以规范化必须在 setActiveBlockedDomains 里做，而不是只做在设置页。
 * isDomainBlocked 的匹配语义不受影响——规则只是被清洗成更可靠的等价形式。
 */
export function normalizeDomainList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    let s = String(raw ?? "").trim().toLowerCase();
    if (!s) continue;
    // 去 scheme（http:// https:// 或其它的 protocol://）
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    // 去路径 / query / hash
    const cut = s.search(/[/?#]/);
    if (cut >= 0) s = s.slice(0, cut);
    if (!s) continue;
    // 去端口（仅当冒号后是纯数字）
    const colon = s.lastIndexOf(":");
    if (colon >= 0 && /^\d+$/.test(s.slice(colon + 1))) s = s.slice(0, colon);
    // 去 www. 前缀与尾随点号
    s = s.replace(/^www\./, "").replace(/\.+$/, "");
    // 只接受"看起来像域名"的行：空格、下划线、中文等直接丢弃（它们永远匹配不到 host）
    if (!s || !/^[a-z0-9][a-z0-9.-]*$/.test(s) || s.startsWith(".")) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** 设置本次搜索生效的黑名单（provider.search / research 入口调用）。空数组 = 不过滤。 */
export function setActiveBlockedDomains(list) {
  active = normalizeDomainList(list);
}
export function getActiveBlockedDomains() {
  return [...active];
}

function normalizeHost(host) {
  return String(host ?? "").toLowerCase().trim().replace(/^www\./, "");
}
function normalizeRule(domain) {
  return String(domain ?? "").toLowerCase().trim().replace(/^www\./, "").replace(/\/+$/, "");
}

/** 单个 URL 是否命中黑名单；URL 无法解析时返回 false（不误伤）。 */
export function isDomainBlocked(url, blocked = active) {
  if (!blocked || blocked.length === 0) return false;
  let host;
  try {
    host = normalizeHost(new URL(String(url)).hostname);
  } catch {
    return false;
  }
  if (!host) return false;
  return blocked.some((raw) => {
    const rule = normalizeRule(raw);
    if (!rule) return false;
    return host === rule || host.endsWith("." + rule);
  });
}

/** 列表过滤：结果条目统一为 { url } 形态，命中黑名的整条丢弃（保持原顺序=让位语义）。 */
export function filterBlockedDomains(items, blocked = active) {
  if (!blocked || blocked.length === 0) return items;
  return items.filter((item) => !isDomainBlocked(item?.url, blocked));
}

/**
 * 结果级收口：引擎返回的 { sources } 在交给上层（provider 返回值 / multi 合并 /
 * runEngineTest / 工具 execute）之前统一过滤。
 *
 * 为什么需要它：uniqueSources 只是 40+ 个引擎里 29 个的"收敛去重"helper，
 * searchAnysearch / searchPlatform 等 11 个引擎并不经过它（各自直接 return sources）。
 * 只在 uniqueSources 里过滤会漏掉这些引擎——#72 首版就是这么漏的。
 * 因此过滤必须落在"结果离开引擎"的所有咽喉点上，而不是某一个 helper 里。
 *
 * 无黑名单 / 无命中时原样返回（零分配），调用方可以直接重新赋值。
 */
export function applyBlockedFilterToResult(result) {
  if (!result || !Array.isArray(result.sources)) return result;
  const sources = filterBlockedDomains(result.sources);
  if (sources.length === result.sources.length) return result;
  return { ...result, sources };
}
