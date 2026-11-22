// #159 regression: the restore entry point must work while the plugin is gone.
//
// The failure it repairs is a patch row naming a provider the plugin used to
// register. After a disable/uninstall no plugin code runs, so the cleanup has
// to live in a separate module and a separate binary.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = new URL("..", import.meta.url);
const restore = await import(new URL("lib/restore.js", root));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const WEB_WITH_RESIDUE = `# comment above
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: ddg
    fetchProvider: fs-quality-fetch
- id: other
  config:
    value: 1
`;

check("both owned ids are removed", () => {
  const result = restore.cleanPatchText(WEB_WITH_RESIDUE);
  assert.equal(result.changed, true);
  assert.deepEqual(result.removed.map((entry) => entry.key).sort(), ["fetchProvider", "searchProvider"]);
});

check("the emptied row is dropped, comments survive", () => {
  const result = restore.cleanPatchText(WEB_WITH_RESIDUE);
  // Only id + name remain after cleanup, which carries nothing: drop it.
  assert.deepEqual(result.dropped, ["web"]);
  const text = result.text;
  assert.ok(text.includes("# comment above"), "prologue comments must survive");
  assert.ok(text.includes("- id: other"), "unrelated rows must survive");
  assert.equal(/- id: web\n/.test(text), false, "the emptied web row should be gone");
});

check("a user-chosen provider is left alone", () => {
  const text = `- id: web
  config:
    searchProvider: brave
    fetchProvider: fs-quality-fetch
`;
  const result = restore.cleanPatchText(text);
  assert.equal(result.changed, true);
  // Only the owned value goes; the explicit choice stays.
  assert.ok(result.text.includes("searchProvider: brave"), "an explicit provider must survive");
  assert.equal(result.text.includes("fs-quality-fetch"), false);
});

check("a web row without residue is untouched", () => {
  const text = `- id: web
  config:
    searchProvider: brave
`;
  const result = restore.cleanPatchText(text);
  assert.equal(result.changed, false);
  assert.equal(result.text, text);
});

check("quoted values are matched, then removed", () => {
  const text = `- id: web
  config:
    searchProvider: "ddg"
`;
  const result = restore.cleanPatchText(text);
  assert.equal(result.changed, true);
  assert.equal(result.removed[0].value, "ddg");
});

check("CRLF files keep their line endings", () => {
  const text = "- id: web\r\n  config:\r\n    searchProvider: ddg\r\n- id: other\r\n  config:\r\n    x: 1\r\n";
  const result = restore.cleanPatchText(text);
  assert.equal(result.changed, true);
  assert.ok(result.text.includes("\r\n"), "CRLF must be preserved");
  assert.ok(result.text.endsWith("\r\n"));
});

check("an empty config block is not left behind", () => {
  // A bare `config:` parses as null and breaks the loader.
  const text = `- id: web
  config:
- id: other
  config:
    x: 1
`;
  const result = restore.cleanPatchText(text);
  // Nothing to remove here - but the invariant we care about is the helper's.
  const cleaned = restore.cleanWebEntry(["- id: web", "  config:"]);
  assert.equal(cleaned.lines.length, 1, "a trailing empty config must be dropped");
});

check("the CLI exposes the restore command and the module is standalone", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
  assert.equal(pkg.bin["dsh-free-search"], "./bin/restore.js");
  const bin = fs.readFileSync(new URL("bin/restore.js", root), "utf8");
  assert.match(bin, /from "\.\.\/lib\/restore\.js"/);
  // It must not need the plugin runtime: no cordis, no tools, no settings.
  assert.equal(/@deepseek-ai\//.test(bin), false, "the restore CLI must not depend on the plugin runtime");
  const lib = fs.readFileSync(new URL("lib/restore.js", root), "utf8");
  assert.equal(/@deepseek-ai\//.test(lib), false, "lib/restore.js must not import host packages");
  assert.equal(/dsh-tools|dsh-settings/.test(lib), false);
});

check("the CLI refuses to write on a bare or unknown invocation", () => {
  // The first version ran a real restore for `--help`, which mangled a profile
  // patch. A CLI that edits user files must fail closed on anything ambiguous.
  const bin = fs.readFileSync(new URL("bin/restore.js", root), "utf8");
  assert.match(bin, /if \(args\.length === 0 \|\| args\.some\(\(arg\) => HELP_FLAGS\.has\(arg\)\)\)/);
  assert.match(bin, /if \(command !== "restore"\)/);
  assert.match(bin, /unknown argument/);
  // The write only happens after the first positional argument is exactly `restore`.
  const restoreAt = bin.indexOf('const dryRun = args.includes("--dry-run");');
  const writeAt = bin.indexOf("cleanProfiles({ home, profile, dryRun })");
  assert.ok(restoreAt > 0 && writeAt > restoreAt, "the write must sit after all argument checks");
});

check("a real profile directory is cleaned end to end", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-restore-"));
  const profileDir = path.join(home, "profiles", "web");
  fs.mkdirSync(profileDir, { recursive: true });
  const file = path.join(profileDir, "cordis.patch.yml");
  fs.writeFileSync(file, WEB_WITH_RESIDUE);

  const results = restore.cleanProfiles({ home });
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].changed, true);

  const after = fs.readFileSync(file, "utf8");
  assert.equal(after.includes("fs-quality-fetch"), false);
  assert.equal(after.includes("ddg"), false);
  assert.ok(fs.existsSync(`${file}.bak-before-free-search-restore`), "a backup must be written");

  // A second run is a no-op.
  const again = restore.cleanProfiles({ home });
  assert.equal(again[0].changed, false);

  fs.rmSync(home, { recursive: true, force: true });
});

check("--dry-run reports without writing", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-restore-"));
  const profileDir = path.join(home, "profiles", "web");
  fs.mkdirSync(profileDir, { recursive: true });
  const file = path.join(profileDir, "cordis.patch.yml");
  fs.writeFileSync(file, WEB_WITH_RESIDUE);

  const results = restore.cleanProfiles({ home, dryRun: true });
  assert.equal(results[0].changed, true);
  assert.equal(fs.readFileSync(file, "utf8"), WEB_WITH_RESIDUE, "dry run must not write");
  assert.equal(fs.existsSync(`${file}.bak-before-free-search-restore`), false);

  fs.rmSync(home, { recursive: true, force: true });
});

check("--profile narrows the cleanup to one profile", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-restore-"));
  for (const name of ["web", "desktop"]) {
    const profileDir = path.join(home, "profiles", name);
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, "cordis.patch.yml"), WEB_WITH_RESIDUE);
  }

  const results = restore.cleanProfiles({ home, profile: "desktop", dryRun: true });
  assert.equal(results.length, 1);
  assert.equal(results[0].profile, "desktop");

  fs.rmSync(home, { recursive: true, force: true });
});

console.log(`OK: ${checks} restore checks passed`);
