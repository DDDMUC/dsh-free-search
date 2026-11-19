// Paging a prompt segment changes which page gets injected, so it has to mark
// the form dirty; otherwise Save stays disabled and the index is never stored.
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

// Grab the handler body of one pager button by its trailing key.
const pagerHandler = (label) => {
  const marker = `, "${label}"),`;
  const at = source.indexOf(marker);
  if (at < 0) return "";
  const start = source.lastIndexOf("onClick: () =>", at);
  if (start < 0) return "";
  return source.slice(start, at);
};

check("the previous-page button marks the form dirty", () => {
  const handler = pagerHandler("prev");
  assert.ok(handler.includes("setIndex"), "prev button no longer changes the page");
  assert.ok(handler.includes("setDirty(true)"), "prev button must mark the form dirty");
});

check("the next-page button marks the form dirty", () => {
  const handler = pagerHandler("next");
  assert.ok(handler.includes("setIndex"), "next button no longer changes the page");
  assert.ok(handler.includes("setDirty(true)"), "next button must mark the form dirty");
});

check("paging also clears stale failure and error text", () => {
  for (const label of ["prev", "next"]) {
    const handler = pagerHandler(label);
    assert.ok(handler.includes("setFailed(false)"), `${label} must reset failed state`);
    assert.ok(handler.includes('setSaveError("")'), `${label} must clear the save error`);
  }
});

check("adding and removing a page still mark the form dirty", () => {
  for (const label of ["add", "remove"]) {
    const handler = pagerHandler(label);
    assert.ok(handler.includes("setDirty(true)"), `${label} must mark the form dirty`);
  }
});

check("the save button stays wired to dirty", () => {
  assert.match(source, /onClick: save,\s*\n\s*disabled: saving \|\| !dirty \|\| !ready,/);
});

console.log(`OK: ${checks} prompt pager checks passed`);
