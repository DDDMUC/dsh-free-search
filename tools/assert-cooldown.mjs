// Cooldown store: reset-time parsing, per-key ids, persistence across restarts.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseResetDelay,
  cooldownDelayFor,
  keyFingerprint,
  keyCooldownId,
  createCooldownStore,
  SESSION,
  SHORT_COOLDOWN_MS,
  DEFAULT_QUOTA_COOLDOWN_MS,
  MONTHLY_COOLDOWN_MS,
  REGION_COOLDOWN_MS,
} from "../lib/cooldown.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("explicit retry-after and reset-in hints are honoured", () => {
  assert.equal(parseResetDelay("Rate limited. Retry-After: 30 seconds"), 30_000);
  assert.equal(parseResetDelay("retry-after 120"), 120_000);
  assert.equal(parseResetDelay("quota exhausted; resets in 2 hours"), 7_200_000);
  assert.equal(parseResetDelay("reset in 30 minutes"), 1_800_000);
  const hour = 3_600_000;
  const now = Date.parse("2030-01-01T00:00:00Z");
  assert.equal(parseResetDelay("quota reset at 2030-01-01T01:00:00Z", now), hour);
  assert.equal(parseResetDelay("monthly quota reached"), MONTHLY_COOLDOWN_MS);
  assert.equal(parseResetDelay("something odd happened"), null);
});

check("the delay for a failure class matches its semantics", () => {
  assert.equal(cooldownDelayFor("auth", "invalid key"), SESSION);
  assert.equal(cooldownDelayFor("quota", "quota exceeded"), DEFAULT_QUOTA_COOLDOWN_MS);
  assert.equal(cooldownDelayFor("quota", "quota exceeded, retry-after: 120"), 120_000);
  assert.equal(cooldownDelayFor("bot-wall", "captcha"), SHORT_COOLDOWN_MS);
  assert.equal(cooldownDelayFor("transient", "socket hang up"), null);
  assert.equal(cooldownDelayFor("transient", "overloaded, retry-after 90"), 90_000);
  assert.equal(cooldownDelayFor("auth", "eligibility check failed"), REGION_COOLDOWN_MS);
});

check("keys get a stable, distinct fingerprint", () => {
  assert.equal(keyFingerprint("sk-aaaa1111"), keyFingerprint("sk-aaaa1111"));
  assert.notEqual(keyFingerprint("sk-aaaa1111"), keyFingerprint("sk-bbbb2222"));
  assert.match(keyCooldownId("EXA_API_KEY", "sk-aaaa1111"), /^key:EXA_API_KEY:/);
  assert.notEqual(keyCooldownId("EXA_API_KEY", "a"), keyCooldownId("TAVILY_API_KEY", "a"));
});

check("a store cools, reports the remainder and clears", () => {
  const store = createCooldownStore({});
  assert.equal(store.isCooling("exa"), false);
  store.set("exa", 60_000, { reason: "quota exceeded", cls: "quota" });
  assert.equal(store.isCooling("exa"), true);
  assert.ok(store.remaining("exa") > 0);
  assert.equal(store.reasonFor("exa"), "quota exceeded");
  assert.equal(store.clear("exa"), true);
  assert.equal(store.isCooling("exa"), false);
  store.set("bing", 60_000);
  store.clear();
  assert.equal(store.isCooling("bing"), false);
});

check("finite cooldowns survive a restart, session ones do not", () => {
  const file = path.join(os.tmpdir(), `dsh-fs-cooldown-${process.pid}-${Date.now()}.json`);
  const t0 = Date.now();
  try {
    const first = createCooldownStore({ statePath: file, now: () => t0 });
    first.set("exa", 60_000, { reason: "quota", cls: "quota" });
    first.set("bing", SESSION, { reason: "bad key", cls: "auth" });

    const second = createCooldownStore({ statePath: file, now: () => t0 + 1_000 });
    assert.equal(second.isCooling("exa"), true);
    assert.equal(second.isCooling("bing"), false, "session cooldowns are in-memory only");
    assert.equal(second.reasonFor("exa"), "quota");

    const later = createCooldownStore({ statePath: file, now: () => t0 + 61_000 });
    assert.equal(later.isCooling("exa"), false, "expired entries are dropped");
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {}
  }
});

check("per-key state is separate from the engine state", () => {
  const store = createCooldownStore({});
  const one = keyCooldownId("EXA_API_KEY", "sk-first-key-0001");
  const two = keyCooldownId("EXA_API_KEY", "sk-second-key-0002");
  store.set(one, 60_000, { reason: "quota", cls: "quota" });
  assert.equal(store.isCooling(one), true);
  assert.equal(store.isCooling(two), false, "a spent key must not cool its sibling");
  assert.equal(store.isCooling("exa"), false, "and it must not freeze the engine on its own");
});

console.log(`OK: ${checks} cooldown checks passed`);
