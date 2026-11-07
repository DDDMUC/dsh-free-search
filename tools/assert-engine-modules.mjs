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
  const modules = [
    "shared.js",
    "ddg.js", "ddg-lite.js", "bing.js", "searxng.js", "degoog.js", "anysearch.js",
    "exa.js", "tavily.js", "firecrawl.js", "parallel.js", "keenable.js", "perplexity.js",
    "deepseek-official.js", "deepseek-tools.js", "serpbase.js", "serply.js", "outcrawl.js", "you.js",
    "tinyfish.js", "jina.js", "baidu.js", "kimi.js", "aliyun.js", "doubao.js",
    "zhihu_shared.js", "zhihu_global.js", "zhihu_site.js",
    "openai.js", "gemini.js", "claude.js",
  ];
  for (const file of modules) {
    assert.equal(fs.existsSync(new URL(`lib/engines/${file}`, root)), true, `missing lib/engines/${file}`);
  }
  for (const file of ["ddg.js", "bing.js", "exa.js", "keenable.js", "baidu.js", "zhihu_global.js", "openai.js"]) {
    assert.match(index, new RegExp(`from "\\./engines/${file}"`));
  }
  assert.equal(/from "\.\/engines\/(?:free|keyed|cn|zhihu|model)\.js"/.test(index), false, "index still imports a family module");
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
