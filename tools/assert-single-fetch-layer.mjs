// tools/assert-single-fetch-layer.mjs
// Nails the consolidation: the cloud fetch layer (httpsJson / htmlToText / fetchVia* /
// call*) must exist in exactly one place - lib/fetch_upstream.js. research.js and
// vertical.js are importers, never a second copy. Run: node tools/assert-single-fetch-layer.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lib = resolve(here, "../lib");
const read = (f) => readFileSync(resolve(lib, f), "utf8");

let pass = 0;
const failures = [];
const assert = (cond, name) => {
  if (cond) { pass += 1; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name); }
};

const EXPORTS = [
  "export function httpsJson",
  "export function htmlToText",
  "export async function fetchViaExa",
  "export async function fetchViaFirecrawl",
  "export async function fetchViaCrawl4ai",
];
const up = read("fetch_upstream.js");
const research = read("research.js");
const vertical = read("vertical.js");

console.log("== A. 唯一实现 ==");
for (const decl of EXPORTS) {
  assert(up.includes(decl), `fetch_upstream.js declares ${decl.slice(7).split("(")[0]}`);
  assert(!research.includes(decl), `research.js does NOT declare ${decl.slice(7).split("(")[0]}`);
  assert(!vertical.includes(decl), `vertical.js does NOT declare ${decl.slice(7).split("(")[0]}`);
}

console.log("\n== B. 依赖方向单向（fetch 谁也不依赖）==");
assert(!/from "\.\/(research|vertical)\.js"/.test(up), "fetch_upstream.js imports neither research nor vertical");
assert(/from "\.\/fetch_upstream\.js"/.test(research), "research.js imports the fetch layer");
assert(/from "\.\/fetch_upstream\.js"/.test(vertical), "vertical.js imports the fetch layer");
assert(!/CONTROLLED_STUBS\s*=\s*\{[^}]*exa/.test(research), "research.js no longer stubs the fetch tier");

console.log("\n== C. 替身键按层归属 ==");
const modelSeams = research.match(/export const CONTROLLED_STUBS = \{([^}]*)\}/)?.[1] ?? "";
const fetchSeams = up.match(/export const CONTROLLED_STUBS = \{([^}]*)\}/)?.[1] ?? "";
assert(/rerank/.test(modelSeams) && /decide/.test(modelSeams), "research keeps the model seams");
assert(/exa/.test(fetchSeams) && /crawl4ai/.test(fetchSeams), "fetch_upstream keeps the fetch seams");
assert(!/exa/.test(modelSeams), "research does not carry fetch seams anymore");

console.log(failures.length === 0 ? `\nOK: ${pass} assertions passed` : `\nFAILED: ${failures.length} of ${pass + failures.length}`);
process.exit(failures.length === 0 ? 0 : 1);
