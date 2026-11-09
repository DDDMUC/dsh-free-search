// Tool parameter schemas must stay inside the host's JSON-value schema DSL.
//
// The DSL is not full JSON Schema: a scalar node accepts only `type`, `enum`,
// `const` plus the annotations `description` / `title` / `default` / `examples`.
// Anything else — `minimum`, `maximum`, `pattern`, `minLength`, `format` — is
// rejected when the tool is registered, so the whole tool never comes up:
//
//   web-search-free: JsonSchemaError: unsupported JSON schema:
//   parameters.maxResults.minimum is not supported by the value schema DSL
//
// Bounds that used to live in the schema are enforced in the handler instead
// (see multiResultLimit / normalizeMultiMaxResults), and the range stays
// documented in the parameter description. This assertion keeps the two in
// sync by failing on any keyword the DSL would refuse.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const sources = ["lib/index.js", "lib/research.js", "lib/vertical.js"]
  .map((relative) => ({ relative, text: fs.readFileSync(new URL(relative, root), "utf8") }));

// Keywords the DSL refuses on a scalar node. Each was once a plausible way to
// express a bound and would silently disable its tool.
const REFUSED = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
];

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("no tool schema declares a keyword the value schema DSL refuses", () => {
  const offenders = [];
  for (const { relative, text } of sources) {
    const lines = text.split(/\r?\n/u);
    lines.forEach((line, index) => {
      // A schema key is a bare `key:` at the start of a trimmed line. Prose and
      // object keys such as `params:` never match because they are not in the
      // refused list.
      const match = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:/u);
      if (match && REFUSED.includes(match[1])) {
        offenders.push(`${relative}:${index + 1} ${match[1]}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `keywords outside the DSL: ${offenders.join(", ")}`);
});

check("the multi_search result ceiling is still enforced at runtime", async () => {
  const { multiResultLimit, normalizeMultiMaxResults, MULTI_RESULTS_MAX } = await import(
    new URL("lib/index.js", root)
  );
  assert.equal(MULTI_RESULTS_MAX, 100);
  // Both ends of the range stay clamped even though the schema no longer says so.
  assert.equal(normalizeMultiMaxResults(0), 20, "below range falls back to the default");
  assert.equal(normalizeMultiMaxResults(1000), MULTI_RESULTS_MAX, "above range is capped");
  assert.equal(multiResultLimit(500, 20), 20, "per-call request never exceeds the ceiling");
  assert.equal(multiResultLimit(0, 20), 8, "absent request falls back to the documented default");
});

check("the documented range still reaches the model through the description", async () => {
  const { toolParam } = await import(new URL("lib/prompt_i18n.js", root));
  for (const lang of ["en", "zh"]) {
    const text = toolParam(lang, "multi_search", "maxResults", { limit: 20 });
    assert.match(text, /20/, `${lang}: the ceiling is stated`);
    assert.match(text, /100/, `${lang}: the hard maximum is stated`);
  }
});

console.log(`\nOK: ${checks}`);
