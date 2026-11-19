// Fallback priority is an editable list: a saved order is authoritative, so an
// engine removed from it must not be re-appended from the default chain.
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url);
const {
  ALL_ENGINES,
  DEFAULT_FALLBACK_ORDER,
  enabledEngines,
  hasCustomFallbackOrder,
  normalizeFallbackOrder,
  routeEngines,
} = await import(new URL("lib/index.js", root));
const { EXPLICIT_ONLY_ENGINES } = await import(new URL("lib/engine_meta.js", root));

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

await check("an empty order still means the full default chain", () => {
  const order = normalizeFallbackOrder([]);
  assert.deepEqual(order, DEFAULT_FALLBACK_ORDER.filter((id) => !EXPLICIT_ONLY_ENGINES.includes(id)));
  assert.equal(order[0], "exa");
  assert.equal(order.includes("baidu-html"), false, "HTML family stays out of the default chain");
});

await check("a saved order is returned exactly, including drops", () => {
  assert.deepEqual(normalizeFallbackOrder(["exa", "bing"]), ["exa", "bing"]);
  assert.deepEqual(normalizeFallbackOrder(["bing", "exa", "bing"]), ["bing", "exa"]);
  assert.deepEqual(normalizeFallbackOrder(["exa", "ghost", 7, null]), ["exa"]);
});

await check("removed engines are not re-appended from the default chain", () => {
  const order = normalizeFallbackOrder(["exa", "bing"]);
  assert.equal(order.includes("tavily"), false);
  assert.equal(order.includes("ddg"), false);
  assert.equal(order.length, 2);
});

await check("html serp engines can be added explicitly", () => {
  assert.deepEqual(normalizeFallbackOrder(["sogou", "exa"]), ["sogou", "exa"]);
});

await check("billed explicit-only engines can be added to the chain on purpose", () => {
  // 默认链仍然不含它们；但用户显式加进回退链就是明确的付费意图，必须生效。
  assert.equal(DEFAULT_FALLBACK_ORDER.includes("openai"), false);
  assert.deepEqual(normalizeFallbackOrder(["exa", "openai"]), ["exa", "openai"]);
  assert.deepEqual(normalizeFallbackOrder(["specstream", "metaso"]), ["specstream", "metaso"]);
});

check("every engine id can be added to the chain", () => {
  const added = normalizeFallbackOrder(ALL_ENGINES);
  assert.deepEqual(added, ALL_ENGINES);
  for (const id of ALL_ENGINES) assert.equal(added.includes(id), true, id);
});

await check("hasCustomFallbackOrder tracks real edits only", () => {
  assert.equal(hasCustomFallbackOrder([]), false);
  assert.equal(hasCustomFallbackOrder(DEFAULT_FALLBACK_ORDER), false);
  const shortened = DEFAULT_FALLBACK_ORDER.slice(0, 5);
  assert.equal(hasCustomFallbackOrder(shortened), true);
  assert.equal(hasCustomFallbackOrder(["exa", "bing"]), true);
});

await check("enabledEngines respects a custom order instead of appending the allowlist", () => {
  const allAllowed = ALL_ENGINES.slice();
  assert.deepEqual(enabledEngines([], ["exa", "bing"], allAllowed), ["exa", "bing"]);
  assert.deepEqual(enabledEngines([], ["exa", "bing"], ["exa", "bing", "tavily"]), ["exa", "bing"]);
});

await check("a default order still lets the whitelist add engines outside the chain", () => {
  // 白名单仍是许可集合：链外的 HTML 引擎被允许时追加到链尾，链上的引擎照常跑。
  const enabled = enabledEngines([], [], ["exa", "baidu-html"]);
  assert.equal(enabled.includes("baidu-html"), true);
  assert.equal(enabled.includes("exa"), true);
  assert.equal(enabled.includes("tavily"), false, "whitelist keeps everything else off");
});

await check("auto routing stays inside a custom order", () => {
  const routed = routeEngines("deepseek harness", { fallbackOrder: ["exa", "bing"] });
  assert.deepEqual(routed, ["exa", "bing"]);
  const zh = routeEngines("可转债 套利", { fallbackOrder: ["baidu", "bing"] });
  assert.deepEqual(zh, ["baidu", "bing"]);
});

await check("the client mirrors the server default chain and wires add/remove", async () => {
  const fs = await import("node:fs");
  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  const listed = client.match(/const DEFAULT_FALLBACK_ORDER = \[([^\]]+)\];/)?.[1] ?? "";
  const ids = [...listed.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, DEFAULT_FALLBACK_ORDER, "client default order must equal the server's");
  assert.match(client, /fallbackAdd/);
  assert.match(client, /removeFallbackEngine/);
  assert.match(client, /path: \["fallbackOrder"\]/);
});

console.log(`OK: ${checks} fallback-order checks passed`);
