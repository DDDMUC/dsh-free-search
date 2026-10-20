// Firecrawl keyless egress refusal detection (follow-up to #88 / proxy question).
// No network: only the pure predicate is exercised.
import assert from "node:assert/strict";

const { isFirecrawlKeylessRefusal, isFirecrawlKeylessBlocked, markFirecrawlKeylessBlocked } = await import("../lib/index.js");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("403 with the VPN/proxy wording is a keyless refusal", () => {
  assert.equal(
    isFirecrawlKeylessRefusal(
      403,
      '{"success":false,"error":"Unfortunately, your IP address looks like a VPN or proxy, so Firecrawl can\'t be used without an API key from here."}'
    ),
    true
  );
});

check("a bare 403 without that wording is not a keyless refusal", () => {
  assert.equal(isFirecrawlKeylessRefusal(403, '{"error":"forbidden"}'), false);
});

check("other statuses are never treated as a keyless refusal", () => {
  assert.equal(isFirecrawlKeylessRefusal(401, "VPN or proxy"), false);
  assert.equal(isFirecrawlKeylessRefusal(429, "VPN or proxy"), false);
  assert.equal(isFirecrawlKeylessRefusal(500, "proxy"), false);
});

check("the cooldown starts inactive", () => {
  assert.equal(isFirecrawlKeylessBlocked(0), false);
  assert.equal(isFirecrawlKeylessBlocked(), false);
});

check("the cooldown is keyed by the proxy configuration", () => {
  markFirecrawlKeylessBlocked("proxy-A");
  const now = Date.now();
  assert.equal(isFirecrawlKeylessBlocked(now, "proxy-A"), true, "same proxy stays blocked");
  assert.equal(isFirecrawlKeylessBlocked(now, "proxy-B"), false, "a different proxy is not blocked");
  markFirecrawlKeylessBlocked("proxy-A");
  assert.equal(isFirecrawlKeylessBlocked(now + 6 * 60 * 60 * 1000 + 1, "proxy-A"), false, "the block expires");
});
console.log(`OK: ${checks} firecrawl keyless checks passed`);
