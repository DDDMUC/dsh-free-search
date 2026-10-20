// Multi-key fields: comma/semicolon/newline separated, with rotation on auth/quota failures.
import assert from "node:assert/strict";

const { splitApiKeys } = await import("../lib/index.js");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("a single key stays a single key", () => {
  assert.deepEqual(splitApiKeys("sk-abc"), ["sk-abc"]);
});

check("comma, semicolon and newline all separate keys", () => {
  assert.deepEqual(splitApiKeys("a,b , c"), ["a", "b", "c"]);
  assert.deepEqual(splitApiKeys("a;b"), ["a", "b"]);
  assert.deepEqual(splitApiKeys("a\nb\r\nc"), ["a", "b", "c"]);
});

check("blank entries are dropped and empty input yields no keys", () => {
  assert.deepEqual(splitApiKeys(" a , ,b, "), ["a", "b"]);
  assert.deepEqual(splitApiKeys(""), []);
  assert.deepEqual(splitApiKeys(undefined), []);
});

console.log(`OK: ${checks} multikey checks passed`);
