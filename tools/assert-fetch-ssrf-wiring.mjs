// #156: the fetch provider is built in lib/index.js, and the option name there
// must match createFetchProvider's parameter (allowedCidrs). A near-miss name
// is silently ignored, so the SSRF allow-list never reaches the guard.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createFetchProvider } from "../lib/fetch_provider.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const indexSource = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");

await check("lib/index.js passes the allow-list under the provider's own option name", () => {
  assert.match(
    indexSource,
    /allowedCidrs: \(\) => current\(\)\.allowFakeIpCidrs/,
    "createFetchProvider expects `allowedCidrs`; any other key is dropped silently"
  );
  assert.equal(
    /^\s*allowFakeIpCidrs: \(\) => current\(\)/m.test(indexSource),
    false,
    "the near-miss `allowFakeIpCidrs` key is not a provider option"
  );
});

await check("an allow-list passed to the provider reaches validateUrl", async () => {
  const seen = [];
  const provider = createFetchProvider({
    resolveApiKey: async () => undefined,
    logger: { warn() {} },
    browserEnabled: () => false,
    allowedCidrs: () => ["198.18.0.0/15"],
    validateUrl: async (url, { allowedCidrs } = {}) => {
      seen.push(allowedCidrs);
      throw new Error("stop after capturing");
    },
  });
  await assert.rejects(() => provider.fetch({ url: "https://example.com/" }, undefined), /stop after capturing/);
  assert.deepEqual(seen, [["198.18.0.0/15"]], "validateUrl must receive the configured CIDRs");
});

await check("a near-miss option name is dropped, which is why #156 was silent", async () => {
  const seen = [];
  const provider = createFetchProvider({
    resolveApiKey: async () => undefined,
    logger: { warn() {} },
    browserEnabled: () => false,
    // The bug: this is not an option the provider reads.
    allowFakeIpCidrs: () => ["198.18.0.0/15"],
    validateUrl: async (url, { allowedCidrs } = {}) => {
      seen.push(allowedCidrs);
      throw new Error("stop after capturing");
    },
  });
  await assert.rejects(() => provider.fetch({ url: "https://example.com/" }, undefined), /stop after capturing/);
  assert.deepEqual(seen, [[]], "the misspelt option must fall back to no allow-list");
});

console.log(`OK: ${checks} ssrf wiring checks passed`);
