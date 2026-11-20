// The multi-key hint must not occupy its own row: it lives in the placeholder
// and the tooltip, so the fallback row keeps its single-line height.
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const keyInputBlock = () => {
  const start = client.indexOf("const renderEngineKeyInput = (id) => {");
  if (start < 0) return "";
  const end = client.indexOf("\n      };", start);
  return client.slice(start, end);
};

check("the key input renders a bare textarea, no wrapper row", () => {
  const block = keyInputBlock();
  assert.ok(block.length > 0, "renderEngineKeyInput not found");
  assert.match(block, /jsx\("textarea"/);
  assert.equal(/dshfs-keyBox/.test(block), false, "the wrapper div is gone");
  assert.equal(/dshfs-keyHint/.test(block), false, "the hint paragraph is gone");
});

check("the format hint moved into placeholder and title", () => {
  const block = keyInputBlock();
  assert.match(block, /placeholder: t\.multiKeyPlaceholder/);
  assert.match(block, /title: t\.multiKeyHint/);
});

check("both locales still explain multi-key entry", () => {
  assert.match(client, /multiKeyPlaceholder: "API key，一行一个"/);
  assert.match(client, /multiKeyPlaceholder: "API key, one per line"/);
  assert.match(client, /one per line or separated by commas/);
});

check("the dead style rules were removed", () => {
  assert.equal(/\.dshfs-keyBox\{/.test(client), false);
  assert.equal(/\.dshfs-keyHint\{/.test(client), false);
});

console.log(`OK: ${checks} multi-key layout checks passed`);
