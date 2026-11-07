#!/usr/bin/env node
// Release helper: bump, verify every offline assertion, commit, tag, and
// optionally push/publish. Run from the repository root:
//
//   node tools/release.mjs 0.9.36
//   node tools/release.mjs 0.9.36 --publish
//   node tools/release.mjs 0.9.36 --publish --notes release-notes.md
//
// --publish pushes master and the tag, publishes to npmjs, and creates a GitHub
// release (auto-generated notes unless --notes is given). Without --publish the
// script stops after the local commit and tag, so the changes can be reviewed.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const version = args.find((arg) => /^\d+\.\d+\.\d+$/.test(arg));
const publish = args.includes("--publish");
const notesIndex = args.indexOf("--notes");
const notesFile = notesIndex >= 0 ? args[notesIndex + 1] : null;

if (!version) {
  console.error("usage: node tools/release.mjs <x.y.z> [--publish] [--notes <file>]");
  process.exit(2);
}

const run = (command, commandArgs, options = {}) => {
  console.log(`\n$ ${command} ${commandArgs.join(" ")}`);
  execFileSync(command, commandArgs, { cwd: root, stdio: "inherit", ...options });
};

const git = (...commandArgs) => run("git", commandArgs);

const status = execFileSync("git", ["status", "--porcelain"], { cwd: root }).toString("utf8");
const dirtyTracked = status
  .split(/\r?\n/)
  .filter((line) => line.trim() && !line.startsWith("??"));
if (dirtyTracked.length > 0) {
  console.error("working tree has uncommitted tracked changes:\n" + dirtyTracked.join("\n"));
  process.exit(1);
}

const tag = `v${version}`;
try {
  execFileSync("git", ["rev-parse", "--verify", tag], { cwd: root, stdio: "ignore" });
  console.error(`tag ${tag} already exists`);
  process.exit(1);
} catch {
  // expected: tag does not exist yet
}

console.log("\n== offline assertions");
const files = fs
  .readdirSync(path.join(root, "tools"))
  .filter((name) => /^assert-.*\.mjs$/.test(name))
  .sort();
for (const name of files) {
  run(process.execPath, [path.join("tools", name)]);
}
console.log(`\n${files.length} assertion scripts passed`);

console.log("\n== bump version");
const packagePath = path.join(root, "package.json");
const clientPath = path.join(root, "lib", "client.js");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.version = version;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
const client = fs.readFileSync(clientPath, "utf8");
const nextClient = client.replace(/(const PLUGIN_VERSION = ")\d+\.\d+\.\d+(";)/, `$1${version}$2`);
if (nextClient === client) {
  console.error("could not update PLUGIN_VERSION in lib/client.js");
  process.exit(1);
}
fs.writeFileSync(clientPath, nextClient);
console.log(`version -> ${version}`);

console.log("\n== commit and tag");
git("add", "package.json", "lib/client.js");
git("commit", "-m", `release ${version}`);
git("tag", tag);

if (!publish) {
  console.log(`\nlocal release commit + ${tag} created.`);
  console.log(`review, then: git push origin master && git push origin ${tag} && npm publish --registry https://registry.npmjs.org`);
  console.log(`or rerun with --publish (and optionally --notes <file>).`);
  process.exit(0);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
git("push", "origin", "master");
git("push", "origin", tag);
run(npm, ["publish", "--registry", "https://registry.npmjs.org"]);

console.log("\n== GitHub release");
const releaseArgs = ["release", "create", tag, "--title", `${version}`, "--generate-notes"];
if (notesFile) releaseArgs.splice(4, 0, "--notes-file", notesFile);
const gh = spawnSync("gh", releaseArgs, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
if (gh.status !== 0) {
  console.warn("gh release create failed; create the release manually.");
}

console.log(`\nreleased ${version}`);
