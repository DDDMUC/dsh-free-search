// Keep both README entry points navigable and the English guide published.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, root), "utf8");
const zh = read("README.md");
const en = read("README.en.md");
const pkg = JSON.parse(read("package.json"));
let checks = 0;
for (const [text, expected] of [
  [zh, "[English](./README.en.md)"],
  [zh, "## 中文"],
  [zh, "## English"],
  [zh, "[README.en.md](./README.en.md)"],
  [en, "[中文](./README.md#中文)"],
  [en, "## English"],
  [en, "### Installation"],
  [en, "### Usage"],
  [en, "### How It Works"],
  [en, "### License"],
]) {
  assert(text.includes(expected), `Missing README navigation or section: ${expected}`);
  checks++;
}
assert(pkg.files.includes("README.en.md"), "Publish the English README with the package");
checks++;
for (const [name, text] of [["README.md", zh], ["README.en.md", en]]) {
  for (const match of text.matchAll(/\]\((\.\/[^\s)]+)\)/g)) {
    const target = decodeURIComponent(match[1].split("#")[0]);
    assert(fs.existsSync(new URL(target, root)), `${name}: missing local link ${target}`);
    checks++;
  }
}
console.log(`OK: ${checks} README language checks passed`);
