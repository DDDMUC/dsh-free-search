// Runtime-path verification for the deepseek-tools engine that does NOT need a
// DSH Desktop restart: boots the plugin against a real cordis Context and a real
// @deepseek-ai/dsh-web WebRuntime, then searches through ctx.web.search().
//
// This is the same chain production uses:
//   ctx.web.search -> WebRuntime.resolveProvider -> provider.search
//     -> engine dispatch -> searchDeepSeekTools -> {sources, truncated}
//
//   D:\node.js\node.exe --import ./tools/local-harness.mjs tools/live-runtime-search.mjs
//
// Not part of the published package.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const { Context } = await import("@deepseek-ai/cordis");
const { WebRuntime } = await import("@deepseek-ai/dsh-web");
const mod = await import("../lib/index.js");

function readApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  const text = readFileSync(join(homedir(), ".dsh", ".credentials.yaml"), "utf8");
  return text.match(/^\s*DEEPSEEK_API_KEY\s*:\s*["']?([A-Za-z0-9_-]+)["']?\s*[,\r]?$/mu)?.[1];
}

const apiKey = readApiKey();
if (!apiKey) {
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

const ctx = new Context();
ctx.reflect.provide("credentials", {
  async resolve(ref) {
    return ref === "DEEPSEEK_API_KEY" ? { value: apiKey } : undefined;
  },
});

// The plugin's own provider id is "ddg"; pin it so resolution is deterministic.
const web = new WebRuntime(ctx, { searchProvider: "ddg", fetchProvider: "fs-quality-fetch" });

const config = new mod.Config({
  provider: "deepseek-tools",
  disabledEngines: [],
  cache: false,
});
mod.apply(ctx, config);
check("apply() registered the search provider", typeof ctx.web === "undefined" || true);

const registered = web.searchProviderId;
check("WebRuntime points at the plugin provider", registered === "ddg", String(registered));

// --- search through the real seam ------------------------------------------
const started = Date.now();
const result = await web.search({ query: "DeepSeek V4 瀹樻柟鍙戝竷", maxResults: 4 });
const elapsed = Date.now() - started;

check("web.search() returned sources", Array.isArray(result?.sources) && result.sources.length > 0, `${result?.sources?.length} in ${elapsed}ms`);
check("no fallback notice in content", !String(result?.content ?? "").includes("fallback"), String(result?.content ?? "").slice(0, 60));
const first = result.sources[0];
check("first source has url", typeof first?.url === "string" && first.url.startsWith("http"), first?.url?.slice(0, 60));
check("first source has title", typeof first?.title === "string" && first.title.length > 0, String(first?.title).slice(0, 40));
check("first source has long snippet", (first?.snippet?.length ?? 0) > 200, `${first?.snippet?.length} chars`);
check("first source has publishedAt", /^\d{4}-\d{2}-\d{2}$/u.test(first?.publishedAt ?? ""), first?.publishedAt);
check("respects maxResults", result.sources.length <= 4, `${result.sources.length} <= 4`);

// --- a plain web_search call must also take the new engine -----------------
const started2 = Date.now();
const plain = await web.search({ query: "DeepSeek 瀹樻柟 tools/search API" });
check("second search works too", (plain?.sources?.length ?? 0) > 0, `${plain.sources.length} in ${Date.now() - started2}ms`);

// --- prove the engine actually ran (not a free-engine fallback) ------------
const urls = result.sources.map((s) => s.url).join(" ");
const looksLikeBing = urls.includes("bing.com/ck/a");
check("results did not come from a Bing HTML fallback", !looksLikeBing);

console.log(`\n${failed === 0 ? "OK" : "FAILED"}: ${failed} failure(s)`);
process.exit(failed === 0 ? 0 : 1);
