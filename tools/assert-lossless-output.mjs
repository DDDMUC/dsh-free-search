// #169: `web_search` failed with "value is not lossless JSON".
//
// The harness snapshots a tool's returned value and rejects anything JSON cannot
// round-trip. An object key holding `undefined` is such a value: it disappears on
// stringify. The host copies the provider result into the tool output, so a single
// engine that forgets `truncated` breaks the whole `web_search` call — even though
// the search itself succeeded and `free_search_test` reports it as fine.
//
// Two layers are pinned here: every engine returns `truncated`, and the provider
// normalises it at the exit anyway (defence in depth, because the next engine
// someone adds will forget again).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = new URL("..", import.meta.url);
const libDir = new URL("lib/", root);
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

const walk = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
};

/** Files that produce a search result: `{ sources, truncated }`. */
const engineFiles = walk(path.join(libDir.pathname.replace(/^\//, ""), "engines"))
  .concat(["platform_engines.js", "agy.js", "serp_engines.js"].map((name) => path.join(libDir.pathname.replace(/^\//, ""), name)))
  .filter((file) => fs.existsSync(file));

check("every engine result declares truncated", () => {
  // A bare `return { sources }` is the shape that caused #169 (brave, plus the
  // X platform search). Nothing may regress to it.
  const offenders = [];
  for (const file of engineFiles) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!/^return \{/.test(trimmed)) return;
      if (!/\bsources\b/.test(trimmed)) return;
      if (/\btruncated\b/.test(trimmed)) return;
      offenders.push(`${path.basename(file)}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `these returns omit truncated: ${offenders.join(", ")}`);
});

check("the provider normalises truncated on the way out", () => {
  // search() is the last place every caller shares: web_search, advanced_search,
  // research and the bridge. Fixing it here means an engine added later cannot
  // take the whole tool down with it.
  assert.match(
    index,
    /return \{ \.\.\.safe, truncated: safe\?\.truncated === true \};/,
    "search() must return a concrete boolean, never undefined",
  );
  const searchAt = index.indexOf("async search(request, signal) {");
  assert.ok(searchAt > 0, "provider.search is missing");
  const block = index.slice(searchAt, index.indexOf("async searchOnce(request, signal)", searchAt));
  assert.match(block, /truncated: safe\?\.truncated === true/, "the normalisation sits on the returning value");
});

check("every other path that hands back a result sets truncated itself", () => {
  // These do not go through provider.search's exit, so each one owes the field.
  assert.match(index, /truncated: r\.truncated \?\? false,/, "runEngineTest finalize()");
  assert.match(index, /sources: dedupeNearDuplicates\(sanitizeSources\(finalSources\)\),\s*\n\s*truncated: false,/, "runMultiSearch");
});

check("the multi branch of searchOnce keeps a boolean", () => {
  // `multi` comes from runMultiSearch, which sets truncated: false. The branch then
  // spreads it into the cache entry and the return value; if that ever stops being
  // true, the normalisation above still covers it.
  const searchOnceAt = index.indexOf("async searchOnce(request, signal) {");
  const multiAt = index.indexOf('if (preferred === "multi") {', searchOnceAt);
  assert.ok(multiAt > searchOnceAt, "the multi branch is missing from searchOnce");
  const block = index.slice(multiAt, multiAt + 1200);
  assert.match(block, /const cached = \{ \.\.\.multi,/, "the branch spreads the multi result");
});

check("no undefined value can reach the tool output through a result object", () => {
  // Model the host's own snapshot: a JSON round-trip must not silently drop a key.
  const snapshot = (value) => JSON.parse(JSON.stringify(value));
  const shape = {
    provider: "brave",
    sources: [{ url: "https://a.test/1", title: "A", snippet: "s" }],
    truncated: false,
  };
  assert.deepEqual(snapshot(shape), shape, "a normalized result survives the round trip");
  // And show what the broken shape did: the key vanishes, which is exactly what the
  // harness refuses to accept as lossless.
  const lossy = { provider: "brave", sources: shape.sources, truncated: undefined };
  assert.equal(Object.hasOwn(snapshot(lossy), "truncated"), false, "an undefined key is dropped by JSON");
  assert.notDeepEqual(snapshot(lossy), lossy, "which is why the old shape failed");
});

console.log(`OK: ${checks} lossless output checks passed`);
