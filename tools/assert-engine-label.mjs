// The engine list label must show how many engines are enabled out of the
// total, e.g. "Globally enabled search engines (36/42)". The helper lives inside
// the browser bundle, so this reads the real function out of lib/client.js
// instead of keeping a second copy that could drift.
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const start = source.indexOf("const engineEnableLabel = ");
if (start < 0) throw new Error("client.js no longer defines engineEnableLabel");
const end = source.indexOf("\n    };", start);
if (end < 0) throw new Error("engineEnableLabel body not found");
const body = source.slice(start, end + "\n    };".length);
const engineEnableLabel = new Function(`${body}\nreturn engineEnableLabel;`)();

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("zh label carries the checked/total counts", () => {
  assert.equal(
    engineEnableLabel("全局启用的搜索引擎", 36, 42),
    "全局启用的搜索引擎 (36/42)"
  );
});

check("en label carries the checked/total counts", () => {
  assert.equal(engineEnableLabel("Globally enabled search engines", 7, 42), "Globally enabled search engines (7/42)");
});

check("zero checked still renders 0/total", () => {
  assert.equal(engineEnableLabel("Enabled", 0, 42), "Enabled (0/42)");
});

check("all checked renders total/total", () => {
  assert.equal(engineEnableLabel("Enabled", 42, 42), "Enabled (42/42)");
});

check("negative or non-numeric counts clamp to 0", () => {
  assert.equal(engineEnableLabel("Enabled", -3, 42), "Enabled (0/42)");
  assert.equal(engineEnableLabel("Enabled", Number.NaN, 42), "Enabled (0/42)");
});

check("missing text falls back to a count-only label", () => {
  assert.equal(engineEnableLabel("", 3, 42), "(3/42)");
});

check("counts are integers even when floats are passed", () => {
  assert.equal(engineEnableLabel("Enabled", 3.9, 42.2), "Enabled (3/42)");
});

check("the settings title actually uses the helper with ENGINE_IDS.length", () => {
  assert.match(source, /engineEnableLabel\(t\.engineEnable, enabledEngineCount, ENGINE_IDS\.length\)/);
  assert.match(source, /const enabledEngineCount = ENGINES\.filter\(\(e\) => e\.id !== "auto" && e\.id !== "multi" && !engineDisabled\(e\.id\)\)\.length;/);
});

console.log(`OK: ${checks} engine label checks passed`);
