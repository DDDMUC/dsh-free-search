// Research evidence quality gate: thin evidence must cap the conclusion.
import assert from "node:assert/strict";
import fs from "node:fs";
import { assessEvidenceQuality } from "../lib/quality.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const source = (url, publishedAt = "") => ({ url, title: url, snippet: "", publishedAt });
const docs = (n) => Array.from({ length: n }, (_, i) => ({ content: `doc ${i}` }));

check("eight sources across three domains with bodies is high", () => {
  const sources = [
    source("https://a.test/1", "2026-10-01"), source("https://a.test/2", "2026-10-02"),
    source("https://a.test/3"), source("https://b.test/1"),
    source("https://b.test/2"), source("https://b.test/3"),
    source("https://c.test/1"), source("https://c.test/2"),
  ];
  const q = assessEvidenceQuality({ sources, documents: docs(3), notes: [] });
  assert.equal(q.level, "high");
  assert.equal(q.cap, "high");
  assert.equal(q.sources, 8);
  assert.equal(q.domains, 3);
  assert.equal(q.dated, 2);
  assert.equal(q.fetched, 3);
});

check("a thin but usable package is medium", () => {
  const q = assessEvidenceQuality({
    sources: [source("https://a.test/1"), source("https://b.test/1"), source("https://b.test/2")],
    documents: docs(1),
  });
  assert.equal(q.level, "medium");
  assert.match(q.note, /verify/i);
});

check("one source is low", () => {
  const q = assessEvidenceQuality({ sources: [source("https://a.test/1")], documents: docs(1) });
  assert.equal(q.level, "low");
  assert.match(q.note, /do not state conclusions as fact/i);
});

check("a degraded run is capped at low even with many sources", () => {
  const sources = Array.from({ length: 10 }, (_, i) => source(`https://${String.fromCharCode(97 + (i % 4))}.test/${i}`));
  const q = assessEvidenceQuality({ sources, documents: docs(4), notes: ["budget_exhausted: search cap"] });
  assert.equal(q.level, "low");
});

check("an empty package is low", () => {
  assert.equal(assessEvidenceQuality({}).level, "low");
});

check("research wires the gate into the schema, output and brief", () => {
  const research = fs.readFileSync(new URL("../lib/research.js", import.meta.url), "utf8");
  assert.match(research, /assessEvidenceQuality\(out\)/);
  assert.match(research, /quality: \{/);
  assert.match(research, /_evidence: \$\{q\.level\}/);
});

console.log(`OK: ${checks} quality checks passed`);
