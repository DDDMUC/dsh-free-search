// The panel's data path, exercised the way the host drives it: a tools/execute
// hook wraps a tool body, provider.search begins/ends, the snapshot is read.
import assert from "node:assert/strict";
import fs from "node:fs";

const repo = "C:/Users/MVT/.dsh/plugins/free-search";
const activity = await import(`file:///${repo}/lib/activity.js`);

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const session = "session-04a2982a";

const hook = (exec, next) =>
  typeof exec?.agent?.sessionId === "string" && exec.agent.sessionId !== ""
    ? activity.runWith({ sessionId: exec.agent.sessionId }, () => next())
    : next();

const runSearch = () => {
  const run = activity.begin({ query: "deepseek 4.1 pro release date" });
  activity.runWith(run, () => {
    activity.engineStart(run, "bing");
    activity.engineEnd(run, "bing", { count: 12 });
    activity.engineStart(run, "exa");
    activity.engineEnd(run, "exa", { error: new Error("invalid api key") });
  });
  activity.finish(run, {
    result: {
      sources: [
        { url: "https://a.example.com/x", title: "A" },
        { url: "https://b.example.com/y", title: "B" },
      ],
      _cache: "miss",
    },
  });
};

check("the hook exposes the session to the search chain", () => {
  activity.resetForTests();
  let seen = "";
  hook({ agent: { sessionId: session } }, () => {
    seen = activity.ctxSession();
  });
  assert.equal(seen, session);
});

check("a record made under the hook is owned by that session", () => {
  activity.resetForTests();
  hook({ agent: { sessionId: session } }, runSearch);
  const snap = activity.snapshot(session);
  assert.equal(snap.history.length, 1);
  assert.equal(snap.latest.sessionId, session);
  assert.equal(snap.latest.query, "deepseek 4.1 pro release date");
});

check("the in-flight run is visible with its current engine", () => {
  activity.resetForTests();
  hook({ agent: { sessionId: session } }, () => {
    const run = activity.begin({ query: "live" });
    activity.runWith(run, () => {
      activity.engineStart(run, "searxng");
      const during = activity.snapshot(session);
      assert.equal(during.current.length, 1);
      assert.equal(during.current[0].currentEngine, "searxng");
      assert.equal(during.current[0].engines[0].status, "running");
    });
    activity.finish(run, { result: { sources: [] } });
  });
  assert.equal(activity.snapshot(session).current.length, 0, "finished runs leave the in-flight list");
});

check("outcomes, counts and sources survive", () => {
  activity.resetForTests();
  hook({ agent: { sessionId: session } }, runSearch);
  const latest = activity.snapshot(session).latest;
  assert.equal(latest.totalResults, 2);
  assert.equal(latest.sources[0].host, "a.example.com");
  const bing = latest.engines.find((e) => e.id === "bing");
  assert.equal(bing.status, "ok");
  assert.equal(bing.count, 12);
  const exa = latest.engines.find((e) => e.id === "exa");
  assert.equal(exa.status, "failed");
  assert.equal(exa.failureClass, "auth");
});

check("an unattributed call stays visible instead of vanishing", () => {
  activity.resetForTests();
  hook({ agent: {} }, runSearch);
  const snap = activity.snapshot(session);
  assert.equal(snap.history.length, 1, "unattributed records must still reach the panel");
  assert.equal(snap.latest.sessionId, "");
});

check("one session does not read another session's records", () => {
  activity.resetForTests();
  hook({ agent: { sessionId: "s1" } }, () => {
    const run = activity.begin({ query: "q1" });
    activity.finish(run, { result: { sources: [] } });
  });
  hook({ agent: { sessionId: "s2" } }, () => {
    const run = activity.begin({ query: "q2" });
    activity.finish(run, { query: "q2", result: { sources: [] } });
  });
  assert.equal(activity.snapshot("s1").latest.query, "q1");
  assert.equal(activity.snapshot("s2").latest.query, "q2");
});

check("the counters the footer prints are wired", () => {
  activity.resetForTests();
  activity.noteHook();
  hook({ agent: { sessionId: session } }, runSearch);
  const stats = activity.stats();
  assert.equal(stats.sawHook, 1);
  assert.equal(stats.began, 1);
  assert.equal(stats.finished, 1);
  assert.equal(stats.history, 1);
});

check("the bridge routes exist and are POST-only behind the guard", () => {
  const index = fs.readFileSync(`${repo}/lib/index.js`, "utf8");
  assert.match(index, /\$\{BRIDGE_PREFIX\}\/activity`/);
  assert.match(index, /\$\{BRIDGE_PREFIX\}\/activity-clear`/);
  assert.match(index, /activitySnapshot\(body\?\.sessionId \?\? ""\)/);
  assert.match(index, /activityClear\(body\?\.sessionId \?\? ""\)/);
  // Both routes call the shared guard before doing anything.
  for (const route of ["activity", "activity-clear"]) {
    const at = index.indexOf(`\${BRIDGE_PREFIX}/${route}\``);
    const block = index.slice(at, at + 400);
    assert.match(block, /if \(!guard\(req, res\)\) return;/);
  }
});

check("the panel component polls and stops on unmount", () => {
  const client = fs.readFileSync(`${repo}/lib/client.js`, "utf8");
  assert.match(client, /timer = setTimeout\(loop, 2000\)/);
  assert.match(client, /if \(timer !== null\) clearTimeout\(timer\)/);
  assert.match(client, /bridgeActivity\(sessionId\)/);
});

console.log(`OK: ${checks} activity pipeline checks passed`);
