// Checkbox rows must not repeat their label: the <label> element already shows
// it next to the checkbox, so a separate .dshfs-label line above it is a
// duplicate heading with no meaning.
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

for (const [label, fieldName] of [
  ["t.sidebarEntryLabel", "sidebarEntry"],
  ["t.slashCommandsLabel", "slashCommands"],
  ["t.keylessFirstLabel", "keylessFirst"],
]) {
  check(`${fieldName} shows its label exactly once`, () => {
    const occurrences = client.split(label).length - 1;
    assert.equal(occurrences, 1, `${label} appears ${occurrences} times`);
  });
}

check("the label lives inside the <label> next to the checkbox", () => {
  for (const label of ["t.sidebarEntryLabel", "t.slashCommandsLabel", "t.keylessFirstLabel"]) {
    const at = client.indexOf(label);
    const before = client.slice(Math.max(0, at - 900), at);
    assert.ok(before.includes('className: "dshfs-platform"'), `${label} is not inside the platform label`);
  }
});

check("other fields keep their heading", () => {
  // Fields with an input/select still need the standalone heading.
  assert.match(client, /className: "dshfs-label",\n\s+children: t\.promptLangLabel,/);
});

console.log(`OK: ${checks} checkbox label checks passed`);
