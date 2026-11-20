// engineSettingField(id, label, value, setter, options) — every call site must
// pass all five, otherwise the label renders as the value and the input gets a
// function (which shows as an empty box).
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

// Collect `engineSettingField(...)` argument lists up to the closing `{` block.
const calls = () => {
  const out = [];
  const marker = "engineSettingField(";
  let at = client.indexOf(marker);
  while (at >= 0) {
    const start = at + marker.length;
    let depth = 1;
    let i = start;
    let args = "";
    while (i < client.length && depth > 0) {
      const ch = client[i];
      if (ch === "(" || ch === "{" || ch === "[") depth += 1;
      else if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
      if (depth > 0) args += ch;
      i += 1;
    }
    out.push(args);
    at = client.indexOf(marker, i);
  }
  return out;
};

check("every engineSettingField call passes an id, label, value and setter", () => {
  const bad = [];
  for (const args of calls()) {
    // Strip the trailing options object; count the leading arguments.
    const head = args.split("\n")[0];
    const parts = head.split(",").map((part) => part.trim()).filter(Boolean);
    // Multi-line calls start with id, label, value on the first line.
    if (parts.length < 3) bad.push(head.trim().slice(0, 60));
  }
  assert.deepEqual(bad, [], `calls missing leading args: ${bad.join(" | ")}`);
});

check("the Tavily endpoint field is wired with its id", () => {
  assert.match(client, /engineSettingField\("tavilyUrl", t\.tavilyUrlLabel, tavilyUrl, setTavilyUrl, \{/);
});

check("no field passes the label where the id belongs", () => {
  // A label reference (t.something) must never be the first argument.
  assert.equal(/engineSettingField\(\s*t\./.test(client), false, "a label is used as the field id");
});

console.log(`OK: ${checks} engine setting field checks passed`);
