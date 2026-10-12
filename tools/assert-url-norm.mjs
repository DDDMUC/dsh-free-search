// #69 Phase 1 第一批：URL 归一化断言。
//
// 背景（reporter §4）：「Normalize URLs and remove only known tracking parameters
// where safe. Preserve query parameters that may identify different resources.」
//
// 原状的 bug：stripOpenaiTracking / stripZhihuTracking 各自零散处理，只在自己引擎
// 适配器里生效；multi 合并阶段的 normUrl 原样保留 u.search —— 于是同一页面带 utm_*
// 与不带会在合并时被当成两条，seenIn 分裂、结果里出现重复条目。
//
// 本断言同时钉住反面：不许过度剥离（把能标识不同资源的参数也删掉会造成错误合并）。
import { stripTrackingParams, normalizeUrlForDedupe, TRACKING_PARAMS } from "../lib/url_norm.js";

let passed = 0;
const failures = [];
const check = (name, cond) => {
  if (cond) { passed++; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name); }
};

check("模块导出 stripTrackingParams", typeof stripTrackingParams === "function");
check("模块导出 normalizeUrlForDedupe", typeof normalizeUrlForDedupe === "function");
check("模块导出 TRACKING_PARAMS（便于审计清单）", Array.isArray(TRACKING_PARAMS));

// ---------- A. 已知追踪参数必须被去掉 ----------
const mustStrip = {
  "utm_source": "https://a.com/p?utm_source=openai",
  "utm_medium": "https://a.com/p?utm_medium=openapi_platform",
  "utm_campaign": "https://a.com/p?utm_campaign=x",
  "gclid": "https://a.com/p?gclid=abc",
  "gclsrc": "https://a.com/p?gclsrc=abc",
  "dclid": "https://a.com/p?dclid=abc",
  "fbclid": "https://a.com/p?fbclid=abc",
  "msclkid": "https://a.com/p?msclkid=abc",
  "yclid": "https://a.com/p?yclid=abc",
  "igshid": "https://a.com/p?igshid=abc",
  "ttclid": "https://a.com/p?ttclid=abc",
  "_gl": "https://a.com/p?_gl=abc",
  "mc_cid": "https://a.com/p?mc_cid=abc",
  "mc_eid": "https://a.com/p?mc_eid=abc",
  "spm": "https://a.com/p?spm=abc",
  "spm_id_from": "https://a.com/p?spm_id_from=abc",
  "vd_source": "https://a.com/p?vd_source=abc",
  "share_medium": "https://a.com/p?share_medium=abc",
  "share_source": "https://a.com/p?share_source=abc",
  "share_plat": "https://a.com/p?share_plat=abc",
};
for (const [param, url] of Object.entries(mustStrip)) {
  const out = stripTrackingParams(url);
  check(`剥掉 ${param}`, !new URL(out).searchParams.has(param));
}

// 大小写不敏感（?UTM_SOURCE=）
check("参数名大小写不敏感", !new URL(stripTrackingParams("https://a.com/p?UTM_SOURCE=x")).searchParams.has("UTM_SOURCE"));
check("原有大小写保留无妨（只要求被剥掉）", stripTrackingParams("https://a.com/p?UTM_SOURCE=x") === "https://a.com/p");

// ---------- B. 能标识不同资源的参数必须保留 ----------
const mustKeep = ["id", "q", "query", "page", "p", "v", "tab", "sort", "order", "lang", "type", "category", "tag", "year", "version"];
for (const p of mustKeep) {
  const url = `https://a.com/p?${p}=42`;
  const out = stripTrackingParams(url);
  check(`保留 ${p}`, new URL(out).searchParams.get(p) === "42");
}
check("混合：剥 utm 保 id", new URL(stripTrackingParams("https://a.com/p?id=7&utm_source=x&gclid=y")).searchParams.get("id") === "7");
check("混合：只剩 id", stripTrackingParams("https://a.com/p?id=7&utm_source=x&gclid=y") === "https://a.com/p?id=7");
check("path 不被改动", stripTrackingParams("https://a.com/some/deep/path?utm_source=x") === "https://a.com/some/deep/path");
check("fragment 保留", stripTrackingParams("https://a.com/p?utm_source=x#sec2") === "https://a.com/p#sec2");
check("scheme 保留", stripTrackingParams("http://a.com/p?utm_source=x") === "http://a.com/p");
check("端口保留", stripTrackingParams("https://a.com:8443/p?utm_source=x") === "https://a.com:8443/p");
check("无参数 URL 原样返回", stripTrackingParams("https://a.com/p") === "https://a.com/p");
check("非法 URL 原样返回（不抛）", stripTrackingParams("not a url") === "not a url");
check("空串不抛", stripTrackingParams("") === "");
check("幂等：剥一次与剥两次结果相同", stripTrackingParams(stripTrackingParams("https://a.com/p?id=7&utm_source=x")) === stripTrackingParams("https://a.com/p?id=7&utm_source=x"));
check("多个 utm_* 一并剥掉", stripTrackingParams("https://a.com/p?utm_source=a&utm_medium=b&utm_campaign=c") === "https://a.com/p");

// ---------- C. 合并用归一化：修掉"同页面带不带 utm 算两条"的真 bug ----------
check("合并键：带 utm 与不带 → 同一条",
  normalizeUrlForDedupe("https://blog.csdn.net/a?id=1&utm_source=openai") ===
  normalizeUrlForDedupe("https://blog.csdn.net/a?id=1"));
check("合并键：知乎营销参数与裸链 → 同一条",
  normalizeUrlForDedupe("https://zhuanlan.zhihu.com/p/123?utm_medium=openapi_platform&utm_source=x") ===
  normalizeUrlForDedupe("https://zhuanlan.zhihu.com/p/123"));
check("合并键：不同资源参数 → 不同条（不许错误合并）",
  normalizeUrlForDedupe("https://a.com/p?id=1") !== normalizeUrlForDedupe("https://a.com/p?id=2"));
check("合并键：不同 path → 不同条",
  normalizeUrlForDedupe("https://a.com/p1") !== normalizeUrlForDedupe("https://a.com/p2"));
check("合并键：大小写主机归一（保持原行为）",
  normalizeUrlForDedupe("https://A.com/P") === normalizeUrlForDedupe("https://a.com/P"));
check("合并键：尾斜杠归一（保持原行为）",
  normalizeUrlForDedupe("https://a.com/p/") === normalizeUrlForDedupe("https://a.com/p"));
check("合并键：非法 URL 不抛且返回小写去尾斜杠",
  typeof normalizeUrlForDedupe("not a url") === "string");

// ---------- D. 清单审计：不许把危险参数放进追踪清单 ----------
const list = new Set(TRACKING_PARAMS.map((s) => s.toLowerCase()));
for (const dangerous of ["id", "q", "page", "v", "tab", "sort", "lang", "type", "from", "scene", "sessionid"]) {
  check(`追踪清单不含危险参数 ${dangerous}`, !list.has(dangerous));
}
// utm_* 走前缀规则（TRACKING_PREFIXES），不属于精确清单 —— 它靠前缀命中
check("utm_source 由前缀规则覆盖（不在精确清单里，避免清单无限枚举）", !list.has("utm_source"));
check("但仍被实际剥掉（前缀生效）", !new URL(stripTrackingParams("https://a.com/p?utm_source=x")).searchParams.has("utm_source"));
check("追踪清单不含空串", !list.has(""));

console.log("");
if (failures.length === 0) console.log(`OK: ${passed} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
