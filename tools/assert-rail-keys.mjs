// The rail nav renders two spans inside a child array; without keys React warns
// on every render ("Each child in a list should have a unique key prop").
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const railBlock = () => {
  const start = source.indexOf('className: "dshfs-railItem"');
  if (start < 0) return "";
  const end = source.indexOf("}, item.id)", start);
  if (end < 0) return "";
  return source.slice(start, end);
};

check("the rail item's dot span carries a key", () => {
  const block = railBlock();
  assert.ok(block.length > 0, "rail item block not found");
  assert.match(block, /className: "dshfs-railDot" \}, "dot"\)/, "dot span needs a stable key");
});

check("the rail item's label span carries a key", () => {
  const block = railBlock();
  assert.match(block, /children: navLabels\[item\.id\] \}, "label"\)/, "label span needs a stable key");
});

check("every array child in the rail block is keyed", () => {
  const block = railBlock();
  const jsx = block.match(/react_jsx_runtime\.jsx\(/g) ?? [];
  // The wrapping <a> is keyed by `}, item.id)` outside this slice; inside the
  // children array there must be exactly two keyed elements.
  const keyed = block.match(/\}, "[a-z]+"\)/g) ?? [];
  assert.equal(jsx.length, 2, `expected 2 child elements, found ${jsx.length}`);
  assert.equal(keyed.length, 2, `expected 2 keys, found ${keyed.length}`);
});

console.log(`OK: ${checks} rail key checks passed`);
