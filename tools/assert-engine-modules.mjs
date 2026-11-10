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
    "deepseek-official.js", "deepseek-tools.js", "serpbase.js", "serply.js", "outcrawl.js", "google.js", "you.js",
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
  assert.equal(meta.ALL_ENGINES.length, 37);
  assert.equal(meta.FREE_ENGINES.length, 6);
  assert.deepEqual(meta.EXPLICIT_ONLY_ENGINES, ["metaso", "openai", "gemini", "claude"]);
  assert.equal(new Set(meta.ALL_ENGINES).size, meta.ALL_ENGINES.length);
});

check("index never touches engine-private names", () => {
  const declared = new Set();
  for (const m of index.matchAll(/^(?:export )?(?:async )?(?:const|let|function|class) ([A-Za-z0-9_$]+)/gm)) declared.add(m[1]);
  for (const m of index.matchAll(/import \{([^}]+)\} from/gm)) {
    for (const name of m[1].split(",")) declared.add(name.trim());
  }
  for (const m of index.matchAll(/export \{([^}]+)\} from/gm)) {
    for (const name of m[1].split(",")) declared.add(name.trim());
  }
  const dir = new URL("lib/engines/", root);
  const leaked = [];
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".js"))) {
    const source = fs.readFileSync(new URL(file, dir), "utf8");
    for (const m of source.matchAll(/^(?:export )?(?:async )?(?:const|let|function|class) ([A-Za-z0-9_$]+)/gm)) {
      const name = m[1];
      if (declared.has(name)) continue;
      if (new RegExp(`\\b${name}\\b`).test(index)) leaked.push(name);
    }
  }
  assert.deepEqual(leaked, [], `index references engine-private names: ${leaked.join(", ")}`);
});

check("the AnySearch key reset stays inside its module", () => {
  const anysearch = fs.readFileSync(new URL("lib/engines/anysearch.js", root), "utf8");
  assert.match(anysearch, /export function resetIgnoredAnysearchKey\(\)/);
  assert.match(index, /resetIgnoredAnysearchKey/);
  assert.equal(/ignoredAnysearchKey\s*=/.test(index), false);
});

console.log(`OK: ${checks} engine-module checks passed`);
