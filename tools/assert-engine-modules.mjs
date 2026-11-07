// Engine layout guard: implementations live in lib/engines, metadata lives in
// engine_meta.js, and the settings client cannot silently drift from the server.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const meta = await import(new URL("lib/engine_meta.js", root));
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("the engine modules exist and are imported by the plugin", () => {
  for (const file of ["shared.js", "free.js", "keyed.js", "cn.js", "zhihu.js", "model.js"]) {
    assert.equal(fs.existsSync(new URL(`lib/engines/${file}`, root)), true, `missing lib/engines/${file}`);
  }
  for (const file of ["free.js", "keyed.js", "cn.js", "zhihu.js", "model.js"]) {
    assert.match(index, new RegExp(`from "\\./engines/${file}"`));
  }
});

check("engine implementations no longer live in index.js", () => {
  for (const name of ["searchDdgHtml", "searchBing", "searchExa", "searchBaidu", "searchOpenai", "searchZhihuGlobal"]) {
    assert.equal(index.includes(`async function ${name}(`), false, `${name} is still defined in index.js`);
  }
});

check("the settings client lists exactly the server engine ids", () => {
  const block = client.slice(client.indexOf("const ENGINES = ["), client.indexOf("\n    ];", client.indexOf("const ENGINES = [")));
  const ids = [...block.matchAll(/\{ id: "([^"]+)"/g)]
    .map((m) => m[1])
    .filter((id) => id !== "auto" && id !== "multi");
  assert.deepEqual([...new Set(ids)].sort(), [...meta.ALL_ENGINES].sort());
});

check("the catalog covers every wired engine", () => {
  assert.equal(meta.ALL_ENGINES.length, 35);
  assert.equal(meta.FREE_ENGINES.length, 6);
  assert.deepEqual(meta.EXPLICIT_ONLY_ENGINES, ["openai", "gemini", "claude"]);
  assert.equal(new Set(meta.ALL_ENGINES).size, meta.ALL_ENGINES.length);
});

console.log(`OK: ${checks} engine-module checks passed`);
