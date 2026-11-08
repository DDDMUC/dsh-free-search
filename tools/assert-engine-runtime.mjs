// Per-engine concurrency gate and in-process call statistics.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createEngineRuntime } from "../lib/engine_runtime.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await check("the limiter never exceeds the per-engine limit", async () => {
  const runtime = createEngineRuntime();
  let active = 0;
  let peak = 0;
  const task = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await sleep(20);
    active -= 1;
  };
  await Promise.all([1, 2, 3, 4].map(() => runtime.run("bing", 2, task)));
  assert.equal(peak, 2);
});

await check("stats aggregate success, empty and failure", () => {
  const runtime = createEngineRuntime();
  runtime.record("exa", { ms: 100, sources: 3 });
  runtime.record("exa", { ms: 200, sources: 0 });
  runtime.record("exa", { ms: 300, error: { class: "quota" } });
  const stats = runtime.snapshot().exa;
  assert.equal(stats.calls, 3);
  assert.equal(stats.ok, 1);
  assert.equal(stats.empty, 1);
  assert.equal(stats.fail, 1);
  assert.equal(stats.avgMs, 200);
  assert.equal(stats.lastErrorClass, "quota");
});

await check("an aborted waiter is removed instead of running later", async () => {
  const runtime = createEngineRuntime();
  let releaseFirst;
  const first = runtime.run("ddg", 1, () => new Promise((resolve) => { releaseFirst = resolve; }));
  const controller = new AbortController();
  let secondRan = false;
  const second = runtime.run("ddg", 1, async () => { secondRan = true; }, { signal: controller.signal });
  await sleep(10);
  controller.abort(new Error("cancelled"));
  await assert.rejects(() => second, /cancelled/);
  releaseFirst();
  await first;
  await sleep(10);
  assert.equal(secondRan, false);
});

await check("both dispatch paths and the doctor use the runtime", async () => {
  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(index, /await engineRuntime\.run\(\s*engine,/);
  assert.match(index, /const result = await engineRuntime\.run\(engine, engineConcurrency\(engine\)/);
  assert.match(index, /stats: engineRuntime\.snapshot\(\)\[id\]/);
  const doctor = fs.readFileSync(new URL("../lib/doctor.js", import.meta.url), "utf8");
  assert.match(doctor, /calls \$\{stats\.calls\} · ok/);
});

console.log(`OK: ${checks} engine-runtime checks passed`);
