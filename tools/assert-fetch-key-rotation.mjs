// #128: web_fetch key rotation + Linux browser discovery.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const { withKeyRotation, createFetchProvider } = await import(new URL("lib/fetch_provider.js", root));
const { CONTROLLED_STUBS } = await import(new URL("lib/fetch_upstream.js", root));

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

await check("a quota-failed key is reported and the next key is tried", async () => {
  const keys = ["bad", "good"];
  const used = [];
  const failures = [];
  const errors = [];
  const result = await withKeyRotation({
    engine: "exa",
    env: "EXA_API_KEY",
    resolveKey: async () => keys.shift() ?? "",
    call: async (key) => {
      used.push(key);
      if (key === "bad") throw new Error("exa HTTP 402: insufficient balance");
      return { text: "ok" };
    },
    onKeyFailure: async (failure) => {
      failures.push(failure);
      return true;
    },
    errors,
  });
  assert.deepEqual(result, { text: "ok" });
  assert.deepEqual(used, ["bad", "good"]);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].engine, "exa");
  assert.equal(failures[0].env, "EXA_API_KEY");
  assert.equal(failures[0].key, "bad");
  assert.equal(failures[0].error.message, "exa HTTP 402: insufficient balance");
  assert.equal(errors.length, 1);
});

await check("a non-rotation error does not consume another key", async () => {
  const used = [];
  const result = await withKeyRotation({
    engine: "firecrawl",
    env: "FIRECRAWL_API_KEY",
    resolveKey: async () => {
      used.push("key");
      return "key";
    },
    call: async () => {
      throw new Error("firecrawl HTTP 500");
    },
    onKeyFailure: async () => false,
    errors: [],
  });
  assert.equal(result, null);
  assert.deepEqual(used, ["key"]);
});

await check("no key means no call", async () => {
  let called = false;
  const result = await withKeyRotation({
    engine: "exa",
    env: "EXA_API_KEY",
    resolveKey: async () => "",
    call: async () => { called = true; return "unexpected"; },
    onKeyFailure: async () => true,
    errors: [],
  });
  assert.equal(result, null);
  assert.equal(called, false);
});

await check("the real fetch provider retries exa with the next key after a 402", async () => {
  const keys = ["bad", "good"];
  const failures = [];
  const original = CONTROLLED_STUBS.exa;
  CONTROLLED_STUBS.exa = async (url, key) => {
    if (key === "bad") throw new Error("exa HTTP 402: insufficient balance");
    return "x".repeat(400);
  };
  try {
    const provider = createFetchProvider({
      resolveApiKey: async () => keys.shift() ?? "",
      onKeyFailure: async (failure) => {
        failures.push(failure);
        return true;
      },
      validateUrl: async () => {},
      browserEnabled: () => false,
      prefer: () => "exa",
      logger: { warn: () => {} },
    });
    const result = await provider.fetch({ url: "https://127.0.0.1:1/x" });
    assert.equal(result.body.content, "x".repeat(400));
    assert.deepEqual(failures.map((failure) => [failure.engine, failure.env, failure.key]), [["exa", "EXA_API_KEY", "bad"]]);
  } finally {
    CONTROLLED_STUBS.exa = original;
  }
});

await check("the fetch provider wires key failure cooling for exa and firecrawl", () => {
  const source = fs.readFileSync(new URL("lib/fetch_provider.js", root), "utf8");
  const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
  assert.match(source, /onKeyFailure/);
  assert.match(source, /withKeyRotation\(\{/);
  assert.match(index, /onKeyFailure:/);
  assert.match(index, /coolKeyForEnv/);
});

await check("Linux browser candidates are discoverable", () => {
  const source = fs.readFileSync(new URL("lib/fetch_provider.js", root), "utf8");
  for (const candidate of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"]) {
    assert.ok(source.includes(candidate), `missing browser candidate ${candidate}`);
  }
});

console.log(`OK: ${checks} fetch-key-rotation checks passed`);
