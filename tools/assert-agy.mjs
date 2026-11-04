// Antigravity CLI engine: prompt shape, envelope parsing, availability.
import assert from "node:assert/strict";
import { buildAgyPrompt, agyItemsFromStdout, agySources, searchAgy, commandOnPath, agyAvailable } from "../lib/agy.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("the prompt carries the query, the cap and the JSON contract", () => {
  const prompt = buildAgyPrompt("deepseek harness", 6);
  assert.match(prompt, /Search the web for: deepseek harness/);
  assert.match(prompt, /up to 6 results/);
  assert.match(prompt, /"items":\[\{"url"/);
  assert.match(prompt, /Never invent URLs/);
});

check("structuredOutput and response envelopes both parse", () => {
  const structured = JSON.stringify({ status: "SUCCESS", structuredOutput: { items: [{ url: "https://a.test/1" }] } });
  assert.equal(agyItemsFromStdout(structured)[0].url, "https://a.test/1");
  const response = JSON.stringify({ status: "SUCCESS", response: 'noise\n{"items":[{"url":"https://b.test/2"}]}\nend' });
  assert.equal(agyItemsFromStdout(response)[0].url, "https://b.test/2");
  const raw = '{"items":[{"url":"https://c.test/3"}]}';
  assert.equal(agyItemsFromStdout(raw)[0].url, "https://c.test/3");
});

check("a non-success status surfaces the upstream detail", () => {
  assert.throws(
    () => agyItemsFromStdout(JSON.stringify({ status: "ERROR", error: "quota exceeded; resets in 2 hours" })),
    /quota exceeded; resets in 2 hours/
  );
  assert.throws(() => agyItemsFromStdout(""), /empty response/);
  assert.throws(() => agyItemsFromStdout('{"status":"SUCCESS","structuredOutput":{"items":[]}}'), /found no results/);
  assert.throws(() => agyItemsFromStdout("not json"), /no JSON result/);
});

check("sources keep http urls, map the fields and respect the cap", () => {
  const items = [
    { url: "https://a.test/1", title: "A", snippet: "sa" },
    { url: "ftp://b.test/2", title: "B" },
    { url: "https://c.test/3" },
  ];
  const sources = agySources(items, 5);
  assert.deepEqual(sources.map((s) => s.url), ["https://a.test/1", "https://c.test/3"]);
  assert.equal(sources[0].title, "A");
  assert.equal(sources[1].title, undefined);
  assert.equal(agySources(items, 1).length, 1);
});

check("the runner gets the CLI flags this engine needs", async () => {
  const calls = [];
  const runner = async (bin, args) => {
    calls.push({ bin, args });
    return JSON.stringify({ status: "SUCCESS", structuredOutput: { items: [{ url: "https://d.test/4", title: "D" }] } });
  };
  const result = await searchAgy("query", 3, { runner, bin: "agy" });
  assert.equal(result.sources[0].url, "https://d.test/4");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, "agy");
  assert.ok(calls[0].args.includes("--output-format"));
  assert.ok(calls[0].args.includes("json"));
  assert.ok(calls[0].args.includes("--model"));
  assert.ok(calls[0].args.includes("--dangerously-skip-permissions"));
  assert.ok(calls[0].args.some((arg) => String(arg).includes("Search the web for: query")));
});

check("a missing binary is reported instead of attempted", () => {
  assert.equal(commandOnPath("definitely-not-a-real-binary-xyz"), false);
  assert.equal(agyAvailable({ PATH: "" }), false);
});

console.log(`OK: ${checks} agy checks passed`);
