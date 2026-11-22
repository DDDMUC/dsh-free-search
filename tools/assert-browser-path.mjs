// #160: the T1.5 browser executable is configurable.
//
// Three behaviours matter:
//   1. empty setting  -> probe the built-in candidate list (unchanged),
//   2. custom setting -> use exactly that path,
//   3. custom but missing -> skip T1.5 instead of silently running another
//      browser, because a wrong path must be visible, not papered over.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = new URL("..", import.meta.url);
const source = fs.readFileSync(new URL("lib/fetch_provider.js", root), "utf8");
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const { detectBrowser, resetBrowserCache } = await import(new URL("lib/fetch_provider.js", root));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const tmpExe = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-browser-"));
  const file = path.join(dir, process.platform === "win32" ? "fake-browser.exe" : "fake-browser");
  fs.writeFileSync(file, "");
  return { dir, file };
};

check("an empty setting still uses the built-in candidate list", () => {
  resetBrowserCache();
  const detected = detectBrowser("");
  console.log(`      detected: ${detected ?? "(none on this machine)"}`);
  // Whatever the machine has, the call must not throw and must return a path or null.
  assert.ok(detected === null || typeof detected === "string");
  const blank = detectBrowser("   ");
  assert.equal(blank, detected, "whitespace must behave like empty");
});

check("a custom path is used verbatim", () => {
  const { dir, file } = tmpExe();
  try {
    resetBrowserCache();
    assert.equal(detectBrowser(file), file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

check("a custom path that does not exist skips T1.5 instead of falling back", () => {
  resetBrowserCache();
  const missing = path.join(os.tmpdir(), "dsh-no-such-browser-", "browser.exe");
  assert.equal(detectBrowser(missing), null, "a bad custom path must not fall back to the candidate list");
});

check("the probe cache follows the setting", () => {
  const first = tmpExe();
  const second = tmpExe();
  try {
    resetBrowserCache();
    assert.equal(detectBrowser(first.file), first.file);
    // Changing the setting must re-resolve, not reuse the cached answer.
    assert.equal(detectBrowser(second.file), second.file);
    assert.equal(detectBrowser(""), detectBrowser(""), "empty stays stable");
  } finally {
    fs.rmSync(first.dir, { recursive: true, force: true });
    fs.rmSync(second.dir, { recursive: true, force: true });
  }
});

check("the fetch provider receives the setting, not a hard-coded probe", () => {
  assert.match(source, /function findSystemBrowser\(customPath = ""\)/);
  assert.match(source, /const browserPath = findSystemBrowser\(browserPathSetting\(\)\)/);
  assert.match(source, /browserPath: browserPathSetting = \(\) => ""/);
});

check("the config key exists and defaults to auto-detect", () => {
  assert.match(index, /browserPath: z\.string\(\)\.default\(""\)\.volatile\(\)/);
  assert.match(index, /browserPath: \(\) => current\(\)\.browserPath \?\? ""/);
});

check("the settings card round-trips the key", () => {
  assert.match(client, /const \[browserPath, setBrowserPath\] = react\.useState\(""\)/);
  assert.match(client, /setBrowserPath\(String\(v\.browserPath \?\? ""\)\)/);
  assert.match(client, /path: \["browserPath"\], value: String\(browserPath \?\? ""\)\.trim\(\)/);
});

check("the input only appears while T1.5 is enabled", () => {
  // Look at the JSX block, not the i18n dictionary: `browserFetch` must gate the
  // extra field so a disabled T1.5 does not show a path box that does nothing.
  const jsxAt = client.indexOf("t.browserFetchLabel,");
  assert.ok(jsxAt > 0, "the browser checkbox must exist in the settings card");
  const block = client.slice(jsxAt, jsxAt + 3000);
  assert.match(block, /browserFetch\s*\n\s*\?\s*react_jsx_runtime\.jsxs\("div"/, "the path field must be conditional on browserFetch");
  assert.match(block, /children: t\.browserPathLabel/);
  assert.match(block, /value: browserPath/);
});

check("the hint explains the no-fallback rule", () => {
  const zh = client.match(/browserPathHint: "([^"]+)"/)?.[1] ?? "";
  const en = client.match(/browserPathHint: "([^"]+)"/g) ?? [];
  assert.ok(zh.includes("不再自动探测"), "the Chinese hint must say auto-detection stops");
  assert.ok(zh.includes("不会改用其它浏览器"), "the Chinese hint must say it will not switch browsers");
  const english = en[en.length - 1] ?? "";
  assert.ok(english.includes("only this executable"), "the English hint must say only this executable is used");
});

console.log(`OK: ${checks} browser path checks passed`);
