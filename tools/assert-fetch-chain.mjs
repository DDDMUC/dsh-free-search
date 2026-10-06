// tools/assert-fetch-chain.mjs — fs-quality-fetch 四层链的独立断言。
// 不依赖 research.js：受控替身直接注入本模块的 CONTROLLED_STUBS（fetch_upstream.js 导出）。
// 运行：node tools/assert-fetch-chain.mjs
import { CONTROLLED_STUBS } from "../lib/fetch_upstream.js";
import { createFetchProvider } from "../lib/fetch_provider.js";

let pass = 0;
const failures = [];
const assert = (cond, name) => {
  if (cond) { pass += 1; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name); }
};
const section = (t) => console.log("\n== " + t + " ==");

// 最小 seam 替身：fetchProvider 只用到 resolveApiKey / logger
const keys = { EXA_API_KEY: "k", FIRECRAWL_API_KEY: "k", CRAWL4AI_API_KEY: "k" };
const provider = createFetchProvider({
  resolveApiKey: async (env) => keys[env],
  logger: { info() {}, warn() {}, error() {}, debug() {} },
});

section("A. 契约");
assert(provider.id === "fs-quality-fetch", "provider id = fs-quality-fetch");
assert(provider.available() === true, "available() 为 true（seam 要求：不得网络调用）");

section("B. 仅支持 https");
let threw = null;
try { await provider.fetch({ url: "http://example.com" }, undefined); } catch (e) { threw = e; }
assert(threw !== null && /only https/.test(threw.message), "http:// 被拒绝（错误信息含 only https）");

section("C. 四层链序：T1 直连失败 → T2 exa 命中即停");
for (const k of Object.keys(CONTROLLED_STUBS)) CONTROLLED_STUBS[k] = null;
let exaCalls = 0, fcCalls = 0, c4Calls = 0;
CONTROLLED_STUBS.exa = async () => { exaCalls += 1; return "e".repeat(500); };
CONTROLLED_STUBS.firecrawl = async () => { fcCalls += 1; return "f".repeat(500); };
CONTROLLED_STUBS.crawl4ai = async () => { c4Calls += 1; return "c".repeat(500); };
const r1 = await provider.fetch({ url: "https://127.0.0.1/nonexistent-host-xyz" }, undefined);
assert(r1.statusCode === 200 && r1.body.kind === "text", "exa 命中返回 kind=text / 200");
assert(exaCalls === 1 && fcCalls === 0 && c4Calls === 0, `exa 命中后不再走 firecrawl/crawl4ai（exa=${exaCalls} fc=${fcCalls} c4=${c4Calls}）`);

section("D. exa 失败 → 降级 firecrawl（静默）");
for (const k of Object.keys(CONTROLLED_STUBS)) CONTROLLED_STUBS[k] = null;
exaCalls = fcCalls = c4Calls = 0;
CONTROLLED_STUBS.exa = async () => { exaCalls += 1; throw new Error("exa down"); };
CONTROLLED_STUBS.firecrawl = async () => { fcCalls += 1; return "f".repeat(500); };
const r2 = await provider.fetch({ url: "https://127.0.0.1/nonexistent-host-xyz" }, undefined);
assert(r2.statusCode === 200 && r2.body.content.startsWith("f"), "exa 失败后 firecrawl 承接");
assert(exaCalls === 1 && fcCalls === 1, `exa/firecrawl 各一次（exa=${exaCalls} fc=${fcCalls}）`);

section("E. 全层失败 → 抛聚合错误（不吞）");
for (const k of Object.keys(CONTROLLED_STUBS)) CONTROLLED_STUBS[k] = null;
CONTROLLED_STUBS.exa = async () => { throw new Error("exa down"); };
CONTROLLED_STUBS.firecrawl = async () => { throw new Error("fc down"); };
CONTROLLED_STUBS.crawl4ai = async () => { throw new Error("c4 down"); };
threw = null;
try { await provider.fetch({ url: "https://127.0.0.1/nonexistent-host-xyz" }, undefined); } catch (e) { threw = e; }
assert(threw !== null && /exa down/.test(threw.message) && /fc down/.test(threw.message), "聚合错误包含各层原因（可追溯）");

console.log("");
if (failures.length === 0) console.log(`OK: ${pass} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
