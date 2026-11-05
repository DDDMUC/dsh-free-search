// #107: older Cordis builds (DSH 0.2.1-rc.2) throw "cannot get property X
// without inject" instead of resolving services lazily. Every service touched as
// a property on the inject() callback context must therefore be declared in the
// plugin's static inject list; optional ones are read through ctx.get().
import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const injectMatch = index.match(/const inject = \[([^\]]*)\];/);
const staticInject = injectMatch
  ? [...injectMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
  : [];

check("the static inject list declares web and the services touched in callbacks", () => {
  for (const service of ["web", "settings", "tools", "systemPrompt"]) {
    assert.equal(staticInject.includes(service), true, `inject is missing ${service}`);
  }
});

check("optional services are read through ctx.get instead of property access", () => {
  assert.equal(/sctx\.webServer\b/.test(index), false, "sctx.webServer is read as a property");
  assert.equal(/sctx\.webStartup\b/.test(index), false, "sctx.webStartup is read as a property");
  assert.match(index, /sctx\.get\("webServer"\)/);
  assert.match(index, /sctx\.get\("webStartup"\)/);
});

check("every property read on an inject callback context is declared statically", () => {
  const allowed = new Set([...staticInject, "effect", "on", "get", "fiber"]);
  const used = new Set([...index.matchAll(/\bsctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  for (const prop of used) {
    assert.equal(allowed.has(prop), true, `sctx.${prop} is used but not declared in inject`);
  }
});

check("dynamic inject dependency lists only name real services", () => {
  const deps = [...index.matchAll(/ctx\.inject\(\[([^\]]*)\]/g)].map((m) => m[1]);
  assert.equal(deps.length >= 8, true, "expected the known inject blocks");
  for (const list of deps) {
    for (const name of [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1])) {
      assert.match(name, /^(webServer|settings|tools|systemPrompt|webStartup)$/, `unexpected inject dependency ${name}`);
    }
  }
});

console.log(`OK: ${checks} inject checks passed`);
