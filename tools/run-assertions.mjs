#!/usr/bin/env node
// Run every offline assertion script in tools/ and print one summary.
// Used by `npm test` and CI; individual scripts remain runnable on their own.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = fs
  .readdirSync(path.join(root, "tools"))
  .filter((name) => /^assert-.*\.mjs$/.test(name))
  .sort();

const failed = [];
let checks = 0;

for (const name of names) {
  console.log(`\n=== ${name}`);
  const result = spawnSync(process.execPath, [path.join("tools", name)], {
    cwd: root,
    encoding: "utf8",
    timeout: 300000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output) process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) {
    failed.push(name);
    continue;
  }
  const matches = [...output.matchAll(/OK: (\d+)/g)];
  const last = matches[matches.length - 1];
  if (last) checks += Number(last[1]);
}

console.log(
  `\n${names.length} scripts, ${checks} checks` +
    (failed.length ? `, failed: ${failed.join(", ")}` : ", all passed")
);
process.exit(failed.length > 0 ? 1 : 0);
