// Empty `provider` means "pick by egress region": mainland China gets bing,
// everywhere else gets parallel; any probe failure falls back to bing.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const { Config, resolveAutoDefaultProvider, currentAutoDefaultProvider, buildBuiltinPromptBlocks } = await import(
  new URL("lib/index.js", root)
);

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const TRACE = "https://www.cloudflare.com/cdn-cgi/trace";
const IPSB = "https://api.ip.sb/geoip";
const IPINFO = "https://ipinfo.io/json";

// answer only the given URL, fail everything else
const only = (url, body) => async (target) => {
  if (target !== url) throw new Error("unexpected source");
  return { ok: true, text: async () => body };
};
const dying = () => async () => {
  throw new Error("network down");
};

const withEnv = async (value, fn) => {
  const previous = process.env.DSH_FREE_SEARCH_DEFAULT;
  if (value === undefined) delete process.env.DSH_FREE_SEARCH_DEFAULT;
  else process.env.DSH_FREE_SEARCH_DEFAULT = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.DSH_FREE_SEARCH_DEFAULT;
    else process.env.DSH_FREE_SEARCH_DEFAULT = previous;
  }
};

await check("an empty provider means auto", () => {
  assert.equal(Config({}).provider.get(), "");
  assert.equal(Config({ provider: "bing" }).provider.get(), "bing");
});

await check("a mainland egress picks bing, any other region picks parallel", async () => {
  await withEnv(undefined, () =>
    resolveAutoDefaultProvider({ fetchImpl: only(TRACE, "ip=1.2.3.4\nloc=CN\ncolo=HKG"), force: true }).then((value) => {
      assert.equal(value, "bing");
      assert.equal(currentAutoDefaultProvider(), "bing");
    })
  );
  await withEnv(undefined, () =>
    resolveAutoDefaultProvider({ fetchImpl: only(TRACE, "ip=5.6.7.8\nloc=SG\ncolo=SIN"), force: true }).then((value) => {
      assert.equal(value, "parallel");
      assert.equal(currentAutoDefaultProvider(), "parallel");
    })
  );
});

await check("the sources are tried in order and a dead probe stays on bing", async () => {
  await withEnv(undefined, () =>
    resolveAutoDefaultProvider({ fetchImpl: only(IPSB, '{"country_code":"SG"}'), force: true }).then((value) => {
      assert.equal(value, "parallel");
    })
  );
  await withEnv(undefined, () =>
    resolveAutoDefaultProvider({ fetchImpl: only(IPINFO, '{"country":"CN"}'), force: true }).then((value) => {
      assert.equal(value, "bing");
    })
  );
  await withEnv(undefined, () =>
    resolveAutoDefaultProvider({ fetchImpl: dying(), force: true }).then((value) => {
      assert.equal(value, "bing");
    })
  );
  await withEnv(undefined, () =>
    resolveAutoDefaultProvider({ fetchImpl: only(TRACE, "no loc here"), force: true }).then((value) => {
      assert.equal(value, "bing", "an unparseable body counts as a failed probe");
    })
  );
});

await check("an explicit override wins over the probe", async () => {
  await withEnv("bing", () =>
    resolveAutoDefaultProvider({ fetchImpl: only(TRACE, "loc=SG"), force: true }).then((value) => assert.equal(value, "bing"))
  );
  await withEnv("parallel", () =>
    resolveAutoDefaultProvider({ fetchImpl: only(TRACE, "loc=CN"), force: true }).then((value) => assert.equal(value, "parallel"))
  );
});

await check("the generated prompt follows whatever the auto default is", async () => {
  await withEnv(undefined, () =>
    resolveAutoDefaultProvider({ fetchImpl: only(TRACE, "loc=CN"), force: true }).then(() => {
      assert.match(buildBuiltinPromptBlocks({}).state.en, /Current mode: bing/);
    })
  );
  await withEnv(undefined, () =>
    resolveAutoDefaultProvider({ fetchImpl: only(TRACE, "loc=US"), force: true }).then(() => {
      assert.match(buildBuiltinPromptBlocks({}).state.en, /Current mode: parallel/);
    })
  );
});

await check("a saved choice still wins in the prompt", () => {
  assert.match(buildBuiltinPromptBlocks({ provider: "ddg" }).state.en, /Current mode: ddg/);
});

await check("the panel gets the effective default and the bundle stops pinning one", () => {
  const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");
  const patch = fs.readFileSync(new URL("cordis.patch.yml", root), "utf8");
  assert.match(index, /const GEO_SOURCES = \[/);
  assert.match(index, /effectiveProvider: getConfig\(\)\.provider \|\| autoDefaultProvider,/);
  assert.match(index, /void resolveAutoDefaultProvider\(\)\.then/);
  assert.equal(/^\s+provider: bing$/m.test(patch), false);
});

console.log(`OK: ${checks} auto-default checks passed`);
