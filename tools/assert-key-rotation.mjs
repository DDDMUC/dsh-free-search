// #96: multi-key round-robin, rotation inside runEngineTest (multi mode), and
// quota-vs-429 classification.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const { pickKeyFromRing, classifyFailure, isKeyRotationCandidate } = await import(new URL("lib/index.js", root));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("keys round-robin across calls and wrap around", () => {
  const ring = { keys: ["k0", "k1", "k2"], index: 0 };
  assert.deepEqual(
    [pickKeyFromRing(ring), pickKeyFromRing(ring), pickKeyFromRing(ring), pickKeyFromRing(ring)],
    ["k0", "k1", "k2", "k0"]
  );
});

check("peek returns the current key without consuming it", () => {
  const ring = { keys: ["a", "b"], index: 1 };
  assert.equal(pickKeyFromRing(ring, true), "b");
  assert.equal(ring.index, 1);
  assert.equal(pickKeyFromRing(ring), "b");
  assert.equal(ring.index, 0);
});

check("a single key and an empty ring never move", () => {
  const single = { keys: ["only"], index: 0 };
  assert.equal(pickKeyFromRing(single), "only");
  assert.equal(pickKeyFromRing(single), "only");
  assert.equal(single.index, 0);
  assert.equal(pickKeyFromRing({ keys: [], index: 0 }), "");
});

check("HTTP 429 + quota markers classify as quota, not transient", () => {
  const baidu = classifyFailure(
    new Error("Baidu API error (HTTP 429): QUOTA_USER_DAILY_FREE: Daily free quota per user for Web Search exceeded")
  );
  assert.equal(baidu.class, "quota");
  const generic = classifyFailure(new Error("HTTP 402 Payment Required: insufficient balance"));
  assert.equal(generic.class, "quota");
});

check("a plain 429 stays transient and carries rateLimited", () => {
  const failure = classifyFailure(new Error("Tavily API error (HTTP 429): too many requests"));
  assert.equal(failure.class, "transient");
  assert.equal(failure.rateLimited, true);
});

check("rotation candidates include auth, quota and rate limits only", () => {
  assert.equal(isKeyRotationCandidate(new Error("HTTP 401 unauthorized")), true);
  assert.equal(isKeyRotationCandidate(new Error("no_more_credits")), true);
  assert.equal(isKeyRotationCandidate(new Error("HTTP 429 rate limit")), true);
  assert.equal(isKeyRotationCandidate(new Error("invalid json in response")), false);
  assert.equal(isKeyRotationCandidate(new Error("HTTP 500")), false);
});

check("multi mode retries keys inside runEngineTest and probes never consume a key", () => {
  const source = fs.readFileSync(new URL("lib/index.js", root), "utf8");
  assert.match(source, /const attemptWithKeyRotation = async \(\) => \{/);
  assert.match(source, /const result = await attemptWithKeyRotation\(\);/);
  assert.match(source, /const retried = await attemptWithKeyRotation\(\);/);
  assert.equal(source.includes("rotateAllKeyRings"), false);
  assert.match(source, /resolveApiKey\(d\.env, d\.settings \?\? undefined, true\)/);
  assert.match(source, /resolveZhihuKey\(true\)/);
});

console.log(`OK: ${checks} key-rotation checks passed`);