// Live end-to-end check for the deepseek-tools engine through the real plugin
// surface: provider.search -> engine dispatch -> shape mapping.
//
//   D:\node.js\node.exe --import ./tools/local-harness.mjs tools/live-deepseek-tools.mjs
//
// Not part of the published package.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const mod = await import("../lib/index.js");

function readApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  const text = readFileSync(join(homedir(), ".dsh", ".credentials.yaml"), "utf8");
  return text.match(/^\s*DEEPSEEK_API_KEY\s*:\s*["']?([A-Za-z0-9_-]+)["']?\s*[,\r]?$/mu)?.[1];
}

const key = readApiKey();
if (!key) {
  console.error("no DEEPSEEK_API_KEY");
  process.exit(1);
}

let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) console.log(`  ok   ${name}${detail ? ` (${detail})` : ""}`);
  else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` (${detail})` : ""}`);
  }
};

console.log(`key length = ${key.length}`);
check("deepseek-tools is registered in ALL_ENGINES", mod.ALL_ENGINES.includes("deepseek-tools"));
check("deepseek-tools is not explicit-only", !mod.EXPLICIT_ONLY_ENGINES.includes("deepseek-tools"));
check("searchDeepSeekTools is exported", typeof mod.searchDeepSeekTools === "function");

// --- 1. engine function, live, no time filter -------------------------------
const t0 = Date.now();
const plain = await mod.searchDeepSeekTools("DeepSeek V4 瀹樻柟鍙戝竷", 5, key, undefined, undefined);
const plainMs = Date.now() - t0;
check("plain query returns sources", Array.isArray(plain.sources) && plain.sources.length > 0, `${plain.sources.length} in ${plainMs}ms`);
check("plain query is not truncated", plain.truncated === false);
const first = plain.sources[0];
check("source has url", typeof first?.url === "string" && first.url.startsWith("http"));
check("source has title", typeof first?.title === "string" && first.title.length > 0);
check("source has snippet", typeof first?.snippet === "string" && first.snippet.length > 0, `${first?.snippet?.length} chars`);
check("snippet prefers the long summary", (first?.snippet?.length ?? 0) > 200, `${first?.snippet?.length} chars`);
check("publishedAt is YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/u.test(first?.publishedAt ?? ""), first?.publishedAt);
check("no duplicate urls", new Set(plain.sources.map((s) => s.url)).size === plain.sources.length);
check("respects maxResults", plain.sources.length <= 5, `${plain.sources.length} <= 5`);

// --- 2. time filter goes into query syntax (after:) -------------------------
const q1 = mod.parseTimeRange("2026-01-01");
check("parseTimeRange('2026-01-01') -> after", q1?.after === "2026-01-01");
const q2 = mod.parseTimeRange("30d");
check("parseTimeRange('30d') -> days", q2?.days === 30);

const t1 = Date.now();
const timed = await mod.searchDeepSeekTools("DeepSeek 鍙戝竷", 5, key, { days: 30 }, undefined);
check("time-filtered query still returns sources", timed.sources.length > 0, `${timed.sources.length} in ${Date.now() - t1}ms`);

// --- 3. an aborted signal must reject, not hang -----------------------------
const ac = new AbortController();
ac.abort();
let aborted = false;
try {
  await mod.searchDeepSeekTools("x", 1, key, undefined, ac.signal);
} catch {
  aborted = true;
}
check("already-aborted signal rejects", aborted);

// --- 4. a bad key surfaces as an auth error, not a retry storm -------------
let authError = "";
try {
  await mod.searchDeepSeekTools("x", 1, "sk-invalid-key-000000000000000000", undefined, undefined);
} catch (error) {
  authError = String(error?.message ?? error);
}
check("bad key reports HTTP 401", /401/u.test(authError), authError.slice(0, 80));

console.log(`\n${failed === 0 ? "OK" : "FAILED"}: ${failed} failure(s)`);
process.exit(failed === 0 ? 0 : 1);
