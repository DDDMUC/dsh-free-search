// #101 follow-up: the official plugin page already owns check-for-update and
// upgrading (Plugins -> Installed -> dsh-free-search -> Update). This plugin used
// to ship a second updater that talked to registry.npmjs.org directly, which
// failed on networks that need a proxy and duplicated the official block.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("the client ships no update UI", () => {
  for (const token of ["dshfs-updatePill", "dshfs-updateIcon", "dshfs-updateOk", "dshfs-upgrade", "bridgeCheckUpdate", "runCheckUpdate", "runUpdate", "updateInfo"]) {
    assert.equal(client.includes(token), false, `client still mentions ${token}`);
  }
});

check("the server ships no update handlers or bridge routes", () => {
  for (const token of ["checkUpdate", "updatePlugin", "fetchLatestVersion", "compareVersions", "detectInstallMode", "NPM_REGISTRY_URL", "check-update"]) {
    assert.equal(index.includes(token), false, `index.js still mentions ${token}`);
  }
  assert.equal(/path: `\$\{BRIDGE_PREFIX\}\/update`/.test(index), false);
});

check("the version label and the rest of the footer survive", () => {
  assert.match(client, /className: "dshfs-version", children: "v" \+ PLUGIN_VERSION/);
  assert.match(client, /const PLUGIN_VERSION = "\d+\.\d+\.\d+";/);
  assert.match(client, /className: "dshfs-footerRight"/);
});

check("the upgrader's exec import is gone but execFile (grok) stays", () => {
  assert.match(index, /import \{ execFile \} from "node:child_process";/);
  assert.equal(index.includes('exec("pnpm add'), false);
});

console.log(`OK: ${checks} single-updater checks passed`);
