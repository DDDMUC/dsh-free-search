// #154 (UI half): multiple keys per engine already work end to end — splitApiKeys
// accepts newlines/commas/semicolons and the key ring rotates them with per-key
// cooldowns. The settings page used to render a single-line password input, so
// nobody could discover that. It is a textarea with a hint now.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const { splitApiKeys } = await import(new URL("lib/engines/shared.js", root));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

check("the backend splits multi-key input three ways", () => {
  assert.deepEqual(splitApiKeys("k1\nk2"), ["k1", "k2"]);
  assert.deepEqual(splitApiKeys("k1,k2"), ["k1", "k2"]);
  assert.deepEqual(splitApiKeys("k1;k2"), ["k1", "k2"]);
  assert.deepEqual(splitApiKeys(" k1 \n\n k2 , k3 ; k4 "), ["k1", "k2", "k3", "k4"]);
  assert.deepEqual(splitApiKeys("k1,k1"), ["k1", "k1"], "rotation keeps duplicates as separate slots");
  assert.deepEqual(splitApiKeys(""), []);
});

check("the engine key input is a textarea, not a single-line password field", () => {
  const start = client.indexOf("const renderEngineKeyInput = (id) => {");
  assert.ok(start > 0, "renderEngineKeyInput not found");
  const end = client.indexOf("\n      };", start);
  const block = client.slice(start, end);
  assert.match(block, /jsx\("textarea"/, "multi-key entry needs a textarea");
  assert.equal(/type: "password"/.test(block), false, "a password input hides the multi-key support");
  assert.match(block, /rows: 2/);
});

check("the hint explains the format and the rotation order", () => {
  assert.match(client, /multiKeyHint:/);
  const zh = client.match(/multiKeyHint: "([^"]+)"/)?.[1] ?? "";
  assert.match(zh, /一行一个|逗号/);
  const enStart = client.indexOf('multiKeyHint: "Multiple keys');
  assert.ok(enStart > 0, "english hint missing");
  const en = client.slice(enStart, client.indexOf('",', enStart));
  assert.match(en, /one per line/i);
  assert.match(en, /rotate/i);
});

check("the key box renders inside the fallback and pool rows", () => {
  assert.match(client, /renderEngineKeyInput\(engineId\)/);
  assert.match(client, /\.dshfs-keyHint\{/);
});

console.log(`OK: ${checks} multi-key UI checks passed`);
