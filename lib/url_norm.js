// #69 Phase 1（第一批）：URL 归一化的唯一权威实现。
//
// 为什么单独成文件：原先 stripOpenaiTracking / stripZhihuTracking 各自零散分布在
// index.js 的引擎适配器里，而 multi 合并阶段的归一化（normUrl）根本不清追踪参数 ——
// 于是同一页面「带 utm_*」与「不带」在合并时被当成两条，seenIn 分裂、结果里出现
// 重复条目。reporter 在 #69 §4 的要求是：只去掉**已知**追踪参数，保留可能标识
// 不同资源的 query 参数。
//
// 纪律（有断言钉住）：
//   - TRACKING_PARAMS 只收业界公认、语义无歧义的追踪参数；不放 from/scene/sessionid
//     这类可能标识资源的参数，否则会造成错误合并。
//   - 归一化只比原行为多一件事：剥追踪参数。主机小写、尾斜杠、fragment 的处理保持不变，
//     避免一次性改变太多去重语义。

/** 已知追踪参数（精确匹配，大小写不敏感）。 */
export const TRACKING_PARAMS = [
  // Google / 搜索引擎点击 id
  "gclid", "gclsrc", "dclid", "yclid",
  // 社交平台点击 id
  "fbclid", "igshid", "ttclid",
  // Microsoft / Bing
  "msclkid",
  // Mailchimp
  "mc_cid", "mc_eid",
  // Google Tag Manager
  "_gl",
  // 阿里系
  "spm", "spm_id_from",
  // 国内技术社区常见的来源标记
  "vd_source",
  // 通用分享参数
  "share_medium", "share_source", "share_plat",
];

const TRACKING_PREFIXES = ["utm_"];

const trackingParamSet = new Set(TRACKING_PARAMS.map((p) => p.toLowerCase()));

function isTrackingParam(key) {
  const lower = String(key).toLowerCase();
  if (trackingParamSet.has(lower)) return true;
  return TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * 去掉 URL 上的已知追踪参数，其余一律保留（含路径、fragment、端口、资源标识参数）。
 * 非法 URL 原样返回，绝不抛错——这里跑在搜索结果路径上，抛错会连带毁掉整次搜索。
 */
export function stripTrackingParams(url) {
  const raw = String(url ?? "");
  if (!raw) return raw;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  let changed = false;
  for (const key of [...parsed.searchParams.keys()]) {
    if (isTrackingParam(key)) {
      parsed.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return raw;
  return parsed.toString();
}

/**
 * 合并/去重用的 URL 归一化。与原实现（index.js 里的 normUrl）逐字对齐，
 * 唯一新增：query 先过 stripTrackingParams，让「带 utm 与不带」归为同一条。
 */
export function normalizeUrlForDedupe(url) {
  let normUrl = String(url ?? "").trim();
  try {
    const u = new URL(stripTrackingParams(normUrl));
    normUrl = `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}${u.hash}`;
  } catch {
    normUrl = normUrl.toLowerCase().replace(/\/+$/, "");
  }
  return normUrl;
}
