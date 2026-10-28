// #97 guard: every file the package imports must survive the "files" allowlist.
// 0.9.18 shipped lib/*.js importing ./prompt_i18n.js while the allowlist still
// enumerated files one by one, so the tarball activated with ERR_MODULE_NOT_FOUND.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const patterns = Array.isArray(pkg.files) ? pkg.files : [];
let checks = 0;
assert(patterns.length > 0, "package.json has no files allowlist");

// expand the allowlist: "lib/" means every lib/*.js, other entries are literal
const covered = new Set();
for (const entry of patterns) {
  if (entry.endsWith("/")) {
    const dir = path.join(root, entry);
    assert(fs.existsSync(dir), `files entry "${entry}" does not exist`);
    for (const name of fs.readdirSync(dir)) covered.add(path.posix.join(entry.replace(/\/$/, ""), name));
  } else {
    assert(fs.existsSync(path.join(root, entry)), `files entry "${entry}" does not exist`);
    covered.add(entry);
  }
}
checks += 1;

// every local module referenced from a published file must itself be published
const published = [...covered].filter((entry) => entry.endsWith(".js"));
assert(published.length > 0, "no published JavaScript files");
const missing = new Set();
for (const entry of published) {
  const source = fs.readFileSync(path.join(root, entry), "utf8");
  for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(entry), match[1]));
    if (!covered.has(target)) missing.add(`${entry} -> ${match[1]}`);
  }
}

assert.equal(
  missing.size,
  0,
  `files allowlist would drop imported modules:\n  ${[...missing].join("\n  ")}`
);
checks += 1;

// entry points must be published too
for (const target of [pkg.main, pkg.exports?.["."], pkg.exports?.["./client"], pkg.dsh?.bundle?.patch]) {
  if (typeof target !== "string") continue;
  const normalised = path.posix.normalize(target.replace(/^\.\//, ""));
  assert(covered.has(normalised), `entry point "${target}" is not covered by files`);
}
checks += 1;

// the guard itself must be able to run before publishing
assert.equal(typeof pkg.scripts?.prepack, "string", "package.json has no prepack guard");
checks += 1;

console.log(`  ok  ${covered.size} files published, ${published.length} modules scanned, no unresolved local imports`);
console.log(`OK: ${checks} package-files checks passed`);