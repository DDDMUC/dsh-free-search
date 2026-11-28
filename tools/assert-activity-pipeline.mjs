// The panel's data path, exercised the way the host drives it: a tools/execute
// hook wraps a tool body, provider.search begins/ends, the snapshot is read.
import assert from "node:assert/strict";
import fs from "node:fs";

const repo = new URL("../", import.meta.url);
const activity = await import(new URL("lib/activity.js", repo));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const session = "session-04a2982a";

// Mirror of the plugin's hook: the host Agent exposes `id` (a SessionId), and
// only older/newer shapes would carry `sessionId`, so both are accepted.
const sessionOf = (exec) => {
  const agent = exec?.agent;
  if (typeof agent?.sessionId === "string" && agent.sessionId !== "") return agent.sessionId;
  if (typeof agent?.id === "string") return agent.id;
  return "";
};

const hook = (exec, next) => {
  const sessionId = sessionOf(exec);
  return sessionId === "" ? next() : activity.runWith({ sessionId }, () => next());
};

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
  hook({ agent: { id: session } }, () => {
    seen = activity.ctxSession();
  });
  assert.equal(seen, session);
});

check("a record made under the hook is owned by that session", () => {
  activity.resetForTests();
  hook({ agent: { id: session } }, runSearch);
  const snap = activity.snapshot(session);
  assert.equal(snap.history.length, 1);
  assert.equal(snap.latest.sessionId, session);
  assert.equal(snap.latest.query, "deepseek 4.1 pro release date");
});

check("the in-flight run is visible with its current engine", () => {
  activity.resetForTests();
  hook({ agent: { id: session } }, () => {
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
  hook({ agent: { id: session } }, runSearch);
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
  hook({ agent: { id: "s1" } }, () => {
    const run = activity.begin({ query: "q1" });
    activity.finish(run, { result: { sources: [] } });
  });
  hook({ agent: { id: "s2" } }, () => {
    const run = activity.begin({ query: "q2" });
    activity.finish(run, { query: "q2", result: { sources: [] } });
  });
  assert.equal(activity.snapshot("s1").latest.query, "q1");
  assert.equal(activity.snapshot("s2").latest.query, "q2");
});

check("the counters the footer prints are wired", () => {
  activity.resetForTests();
  activity.noteHook();
  hook({ agent: { id: session } }, runSearch);
  const stats = activity.stats();
  assert.equal(stats.sawHook, 1);
  assert.equal(stats.began, 1);
  assert.equal(stats.finished, 1);
  assert.equal(stats.history, 1);
});

check("the bridge routes exist and are POST-only behind the guard", () => {
  const index = fs.readFileSync(new URL("lib/index.js", repo), "utf8");
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
  const client = fs.readFileSync(new URL("lib/client.js", repo), "utf8");
  assert.match(client, /timer = setTimeout\(loop, 2000\)/);
  assert.match(client, /if \(timer !== null\) clearTimeout\(timer\)/);
  assert.match(client, /bridgeActivity\(sessionId\)/);
});

check("the host's Agent shape is what the hook reads", () => {
  // dsh-agent declares `readonly id: SessionId` and nothing else; reading
  // `sessionId` alone made every record unattributed, so the panel showed
  // every session's history. Keep both shapes accepted and pin the real one.
  const index = fs.readFileSync(new URL("lib/index.js", repo), "utf8");
  const at = index.indexOf('sctx.on("tools/execute"');
  const body = index.slice(at, at + 700);
  assert.match(body, /agent\.id/, "the hook must fall back to agent.id");
  assert.match(body, /agent\.sessionId/, "agent.sessionId is still accepted for other hosts");
});

check("unattributed records are only shared when nothing is attributed", () => {
  activity.resetForTests();
  // One attributed record is enough to make attribution authoritative.
  hook({ agent: { id: "s1" } }, () => {
    const run = activity.begin({ query: "q1" });
    activity.finish(run, { result: { sources: [] } });
  });
  const other = activity.snapshot("s2");
  assert.equal(other.history.length, 0, "s2 must not see s1's records");
  assert.equal(other.latest, null);
});

check("engine events survive the concurrency queue", () => {
  // engineRuntime.run() queues the callback, so the AsyncLocalStorage scope is
  // gone by the time it executes. Without the module-level fallback every engine
  // event was dropped and the panel read "no engines" next to real results.
  activity.resetForTests();
  hook({ agent: { id: session } }, () => {
    const run = activity.begin({ query: "queued" });
    // Simulate leaving the run's ALS scope before the engine events fire.
    activity.engineStart(null, "bing");
    activity.engineEnd(null, "bing", { count: 9 });
    activity.finish(run, { result: { sources: [{ url: "https://a.example.com", title: "a" }] } });
  });
  const latest = activity.snapshot(session).latest;
  assert.equal(latest.engines.length, 1, "the engine event must attach to the active run");
  assert.equal(latest.engines[0].id, "bing");
  assert.equal(latest.engines[0].count, 9);
});

check("a cache hit reports the engine that filled the cache", () => {
  activity.resetForTests();
  hook({ agent: { id: session } }, () => {
    const run = activity.begin({ query: "cached" });
    activity.finish(run, {
      result: {
        provider: "bing",
        sources: [{ url: "https://c.example.com", title: "c" }],
        _cache: "hit",
      },
    });
  });
  const latest = activity.snapshot(session).latest;
  assert.equal(latest.cache, "hit");
  assert.equal(latest.engines.length, 1, "a cache hit must name the engine behind it");
  assert.equal(latest.engines[0].id, "bing");
  assert.equal(latest.engines[0].cached, true);
});

check("a record carries the turn it ran in", () => {
  activity.resetForTests();
  hook({ agent: { id: session } }, () => {
    const run = activity.begin({ query: "t3", turn: 3 });
    activity.finish(run, { result: { sources: [] } });
  });
  const latest = activity.snapshot(session).latest;
  assert.equal(latest.turn, 3, "the record must keep its turn");
});

check("the turn comes from the tool scope when begin does not pass one", () => {
  activity.resetForTests();
  activity.withToolScope({ sessionId: session, turn: 7 }, () => {
    const run = activity.begin({ query: "t7" });
    activity.finish(run, { result: { sources: [] } });
  });
  assert.equal(activity.snapshot(session).latest.turn, 7, "begin must read the turn off the scope");
});

check("an unknown turn degrades to 0 instead of breaking the record", () => {
  activity.resetForTests();
  hook({ agent: { id: session } }, () => {
    const run = activity.begin({ query: "no-turn" });
    activity.finish(run, { result: { sources: [] } });
  });
  assert.equal(activity.snapshot(session).latest.turn, 0);
});

check("the history list shows a turn when one is known", () => {
  const client = fs.readFileSync(new URL("lib/client.js", repo), "utf8");
  assert.match(client, /dsfs-act-histTurn/, "the history row needs a turn chip");
  assert.match(client, /entry\.turn > 0/, "the chip must be conditional");
  assert.match(client, /turnN: "第 \{n\} 轮"/);
  assert.match(client, /turnN: "Turn \{n\}"/);
});

check("a cache hit names its engine at the hit site, not only at finish", () => {
  activity.resetForTests();
  hook({ agent: { id: session } }, () => {
    const run = activity.begin({ query: "hit-site" });
    // The provider's early-return path calls this before any engine loop runs.
    activity.noteCacheHit(run, "bing", 10);
    activity.finish(run, {
      result: { provider: "bing", sources: new Array(10).fill({ url: "https://x.example.com" }), _cache: "hit" },
    });
  });
  const latest = activity.snapshot(session).latest;
  assert.equal(latest.engines.length, 1, "the hit site must record the engine");
  assert.equal(latest.engines[0].id, "bing");
  assert.equal(latest.engines[0].cached, true);
  assert.equal(latest.engines[0].count, 10);
});

check("a repeated cache hit does not duplicate the engine", () => {
  activity.resetForTests();
  hook({ agent: { id: session } }, () => {
    const run = activity.begin({ query: "twice" });
    activity.noteCacheHit(run, "bing", 10);
    activity.noteCacheHit(run, "bing", 10);
    activity.finish(run, { result: { provider: "bing", sources: [], _cache: "hit" } });
  });
  assert.equal(activity.snapshot(session).latest.engines.length, 1, "the same engine must appear once");
});

check("a cache hit with no stored provider still says cache, not nothing", () => {
  activity.resetForTests();
  hook({ agent: { id: session } }, () => {
    const run = activity.begin({ query: "unknown-engine" });
    activity.noteCacheHit(run, undefined, 4);
    activity.finish(run, { result: { sources: [], _cache: "hit" } });
  });
  const engines = activity.snapshot(session).latest.engines;
  assert.equal(engines.length, 1);
  assert.equal(engines[0].id, "cache", "an unknown provider falls back to a cache label");
  assert.equal(engines[0].cached, true);
});

console.log(`OK: ${checks} activity pipeline checks passed`);
