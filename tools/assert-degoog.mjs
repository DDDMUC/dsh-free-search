// degoog (self-hosted aggregator) wiring: URL building + registry placement.
// No network: only the pure URL helper and the engine registry are exercised.
import assert from "node:assert/strict";

const { degoogSearchUrl, ALL_ENGINES, DEFAULT_FALLBACK_ORDER } = await import("../lib/index.js");
const { credentialRequirement } = await import("../lib/multi_policy.js");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("a bare host becomes /api/search", () => {
  assert.equal(degoogSearchUrl("https://d.example", "hello"), "https://d.example/api/search?q=hello&type=web");
});

check("a base already ending in /api is not doubled", () => {
  assert.equal(degoogSearchUrl("https://d.example/api", "hello"), "https://d.example/api/search?q=hello&type=web");
  assert.equal(degoogSearchUrl("https://d.example/api/", "hello"), "https://d.example/api/search?q=hello&type=web");
});

check("query text is URL-encoded", () => {
  const url = degoogSearchUrl("https://d.example", "C++ & 搜索");
  assert.match(url, /q=C%2B%2B/);
  assert.match(url, /&type=web$/);
});

check("a time filter maps onto degoog's time parameter", () => {
  assert.match(degoogSearchUrl("https://d.example", "q", { timeRange: { days: 1 } }), /[?&]time=day([&]|$)/);
  assert.match(degoogSearchUrl("https://d.example", "q", { timeRange: { days: 7 } }), /[?&]time=week([&]|$)/);
  assert.match(degoogSearchUrl("https://d.example", "q", { timeRange: { days: 30 } }), /[?&]time=month([&]|$)/);
  assert.match(degoogSearchUrl("https://d.example", "q", { timeRange: { days: 365 } }), /[?&]time=year([&]|$)/);
});

check("lang is forwarded only when set", () => {
  assert.match(degoogSearchUrl("https://d.example", "q", { lang: "ja" }), /[?&]lang=ja([&]|$)/);
  assert.equal(degoogSearchUrl("https://d.example", "q", {}).includes("lang="), false);
});

check("degoog is a known engine and part of the default order", () => {
  assert.equal(ALL_ENGINES.includes("degoog"), true);
  assert.equal(DEFAULT_FALLBACK_ORDER.includes("degoog"), true);
});

check("degoog needs no credentials (self-hosted instance only)", () => {
  assert.equal(credentialRequirement("degoog"), null);
});

console.log(`OK: ${checks} degoog checks passed`);
