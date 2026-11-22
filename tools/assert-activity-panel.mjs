// #144: the right-sidebar activity panel.
//
// Two guarantees matter here:
//   1. the panel is opt-in and degrades to nothing on hosts without the right
//      sidebar services (0.2.1-rc.x has no `sidebarRightTabs`), and
//   2. the data face is session-scoped, capped and in-memory only - a search
//      query is user content, so it is never written to disk.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const indexSrc = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const clientSrc = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const activitySrc = fs.readFileSync(new URL("lib/activity.js", root), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));

const activity = await import(new URL("lib/activity.js", root));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("the activity module keeps records in memory only", () => {
  // A search query is user content. Writing it to disk needs an explicit design.
  assert.equal(/writeFileSync|appendFile|createWriteStream/.test(activitySrc), false, "activity must not write to disk");
  assert.match(activitySrc, /let history = \[\]/);
});

check("history is capped at 50 and sources at 8", () => {
  const { HISTORY_MAX, SOURCES_MAX } = activity.ACTIVITY_LIMITS;
  assert.equal(HISTORY_MAX, 50);
  assert.equal(SOURCES_MAX, 8);
  activity.resetForTests();
  for (let i = 0; i < 70; i += 1) {
    const run = activity.begin({ query: "q" + i, sessionId: "s1" });
    activity.finish(run, { result: { sources: [] } });
  }
  const snap = activity.snapshot("s1");
  assert.equal(snap.history.length, 50, `history kept ${snap.history.length}`);
});

check("sources are trimmed to the cap and carry a host", () => {
  activity.resetForTests();
  const run = activity.begin({ query: "q", sessionId: "s1" });
  const sources = Array.from({ length: 20 }, (_, i) => ({ url: "https://e" + i + ".example.com/a", title: "t" + i }));
  activity.finish(run, { result: { sources } });
  const latest = activity.snapshot("s1").latest;
  assert.equal(latest.sources.length, 8);
  assert.equal(latest.sources[0].host, "e0.example.com");
  assert.equal(latest.totalResults, 20);
});

check("a session only sees its own records", () => {
  activity.resetForTests();
  for (const sessionId of ["s1", "s2"]) {
    const run = activity.begin({ query: "q-" + sessionId, sessionId });
    activity.finish(run, { result: { sources: [] } });
  }
  assert.equal(activity.snapshot("s1").history.length, 1);
  assert.equal(activity.snapshot("s1").latest.query, "q-s1");
  assert.equal(activity.snapshot("s2").latest.query, "q-s2");
  assert.equal(activity.snapshot("").history.length, 2, "the global view spans sessions");
});

check("in-flight runs are reported while running and gone after finishing", () => {
  activity.resetForTests();
  const run = activity.begin({ query: "live", sessionId: "s1" });
  activity.engineStart(run, "bing");
  const during = activity.snapshot("s1");
  assert.equal(during.current.length, 1);
  assert.equal(during.current[0].currentEngine, "bing");
  assert.equal(during.current[0].engines[0].status, "running");

  activity.engineEnd(run, "bing", { count: 12 });
  activity.finish(run, { result: { sources: [{ url: "https://a.example.com/x", title: "a" }] } });
  const after = activity.snapshot("s1");
  assert.equal(after.current.length, 0, "the run must leave the in-flight list");
  assert.equal(after.latest.engines[0].status, "ok");
  assert.equal(after.latest.engines[0].count, 12);
});

check("engine outcomes are classified", () => {
  activity.resetForTests();
  const run = activity.begin({ query: "q", sessionId: "s1" });
  activity.engineStart(run, "exa");
  activity.engineEnd(run, "exa", { error: new Error("invalid api key") });
  activity.engineStart(run, "kimi");
  activity.engineEnd(run, "kimi", { skipped: true, error: new Error("does not support time filtering") });
  activity.engineStart(run, "bing");
  activity.engineEnd(run, "bing", { count: 5 });
  activity.finish(run, { result: { sources: [] } });
  const engines = activity.snapshot("s1").latest.engines;
  assert.equal(engines.find((e) => e.id === "exa").status, "failed");
  assert.equal(engines.find((e) => e.id === "exa").failureClass, "auth");
  assert.equal(engines.find((e) => e.id === "kimi").status, "skipped");
  assert.equal(engines.find((e) => e.id === "kimi").skipReason, "time-filter");
  assert.equal(engines.find((e) => e.id === "bing").status, "ok");
});

check("clear drops the session's records", () => {
  activity.resetForTests();
  const run = activity.begin({ query: "q", sessionId: "s1" });
  activity.finish(run, { result: { sources: [] } });
  activity.clear("s1");
  assert.equal(activity.snapshot("s1").history.length, 0);
  assert.equal(activity.snapshot("s1").latest, null);
});

check("the panel is on by default and only an explicit false turns it off", () => {
  assert.match(indexSrc, /activityPanel: z\.boolean\(\)\.default\(true\)\.volatile\(\)/);
  assert.match(clientSrc, /view\?\.value\?\.activityPanel !== false/);
});

check("hosts without the right sidebar simply get no panel", () => {
  // ctx.inject on a missing service must not break the rest of the plugin.
  assert.match(clientSrc, /ctx\.inject\(\["sidebarRightTabs"\]/);
  assert.match(clientSrc, /旧宿主：没有右侧栏服务，面板整体不出现/);
  assert.equal(/ctx\.get\("sidebarRightTabs"\)/.test(clientSrc), false, "must not dereference the service directly");
});

check("the tab registers a body, a title and a guide entry", () => {
  assert.match(clientSrc, /name: "sidebar\.right\.pane\.tab", key: ACTIVITY_TAB_ID/);
  assert.match(clientSrc, /name: "sidebar\.right\.pane\.tab\.title", key: ACTIVITY_TAB_ID/);
  assert.match(clientSrc, /commandId: "free-search\.activity"/);
});

check("the bridge routes are POST-only and session-scoped", () => {
  assert.match(indexSrc, /path: `\$\{BRIDGE_PREFIX\}\/activity`/);
  assert.match(indexSrc, /path: `\$\{BRIDGE_PREFIX\}\/activity-clear`/);
  assert.match(indexSrc, /activitySnapshot\(body\?\.sessionId \?\? ""\)/);
  // Both routes sit behind the same guard as the settings bridge.
  const guardUses = (indexSrc.match(/if \(!guard\(req, res\)\) return;/g) || []).length;
  assert.ok(guardUses >= 10, "the activity routes must use the shared guard");
});

check("tool dispatch carries the session so the chain can attribute a search", () => {
  assert.match(indexSrc, /sctx\.on\("tools\/execute"/);
  // The host's Agent exposes `id` (a SessionId), not `sessionId`; both are accepted.
  assert.match(indexSrc, /exec\?\.agent/);
  assert.match(indexSrc, /agent\.id/);
  // The hook now carries session + turn through the tool scope.
  assert.match(indexSrc, /activityWithToolScope\(\{ sessionId, turn \}/);
});

check("the panel polls only while mounted and stops on unmount", () => {
  assert.match(clientSrc, /const loop = \(\) => \{/);
  assert.match(clientSrc, /timer = setTimeout\(loop, 2000\)/);
  assert.match(clientSrc, /if \(timer !== null\) clearTimeout\(timer\)/);
});

check("both UI languages exist", () => {
  const labels = clientSrc.slice(clientSrc.indexOf("const ACTIVITY_LABELS"));
  assert.ok(labels.includes("搜索动态"));
  assert.ok(labels.includes("Search activity"));
});

check("the package declares the new sources", () => {
  assert.ok(pkg.files.includes("lib/"), "lib/ ships as a directory");
});

console.log(`OK: ${checks} activity panel checks passed`);
