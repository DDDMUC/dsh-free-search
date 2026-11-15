// Host compatibility declaration guard.
//
// Two readers consume this manifest, and they do not agree on where the DSH
// requirement lives:
//   * the launcher's install gate (dsh-app-boot `unmetRequirements`) reads the
//     TOP-LEVEL `engines.dsh` and, when that is present, ignores peer ranges;
//   * the community market (`manifestFacts`) reads top-level `engines.dsh` first,
//     else `dsh.engines.dsh`, and ANDs it with every `@deepseek-ai/dsh*` peer.
//
// Before 0.9.51 only `dsh.engines.dsh` was declared, so the gate silently fell
// back to the peer ranges, which stopped at `^0.2.0-rc.1`: a 0.3.x host was
// refused even though `dsh.engines.dsh` claimed `<0.4.0-0`, and the market
// showed the two declarations as an unsatisfiable intersection. Keep both
// readers on one range, and keep every declared range satisfiable by every
// host the manifest claims to support.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

// --- a dependency-free SemVer subset: enough for `>=`, `>`, `<`, `<=`, `=`,
// `^`, `~` and exact comparators, with prereleases participating in ranges
// exactly as the launcher evaluates them (`includePrerelease: true`).
function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(version).trim());
  if (!match) throw new Error(`invalid semver: ${version}`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] === undefined ? [] : match[4].split("."),
  };
}

function comparePre(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const left = a[index];
    const right = b[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      if (Number(left) !== Number(right)) return Number(left) - Number(right);
      continue;
    }
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

function compare(left, right) {
  for (let index = 0; index < 3; index++) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index];
  }
  return comparePre(left.pre, right.pre);
}

function bump(version, part, prereleaseZero) {
  const next = [...version.core];
  next[part] += 1;
  for (let index = part + 1; index < 3; index++) next[index] = 0;
  const text = `${next[0]}.${next[1]}.${next[2]}`;
  return parse(prereleaseZero ? `${text}-0` : text);
}

function comparator(version, token) {
  const operator = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(token);
  if (!operator) throw new Error(`invalid range token: ${token}`);
  const [, symbol = "=", raw] = operator;
  const target = parse(raw);
  switch (symbol) {
    case ">=": return compare(version, target) >= 0;
    case "<=": return compare(version, target) <= 0;
    case ">": return compare(version, target) > 0;
    case "<": return compare(version, target) < 0;
    case "=": return compare(version, target) === 0;
    case "~":
      return compare(version, target) >= 0 && compare(version, bump(target, target.core[0] === 0 && target.core[1] === 0 ? 2 : 1, true)) < 0;
    case "^":
      // ^0.x.y stops before the next minor; ^x.y.z before the next major.
      return compare(version, target) >= 0 &&
        compare(version, bump(target, target.core[0] === 0 ? 1 : 0, true)) < 0;
    default:
      throw new Error(`unsupported operator: ${symbol}`);
  }
}

function satisfies(version, range) {
  const parsed = parse(version);
  return String(range)
    .split("||")
    .map((alternative) => alternative.trim())
    .filter(Boolean)
    .some((alternative) => alternative.split(/\s+/).every((token) => comparator(parsed, token)));
}

const enginesDsh = pkg.engines?.dsh;
const nestedEnginesDsh = pkg.dsh?.engines?.dsh;
const peers = Object.entries(pkg.peerDependencies ?? {}).filter(
  ([name]) => name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-"),
);

check("the launcher gate finds an engines.dsh at the top level", () => {
  assert.equal(typeof enginesDsh, "string", "package.json engines.dsh is missing: the gate would fall back to peer ranges");
  assert.ok(enginesDsh.trim().length > 0, "package.json engines.dsh is empty");
});

check("top-level and dsh.engines.dsh state the same requirement", () => {
  assert.equal(nestedEnginesDsh, enginesDsh, "the gate and the market would read different ranges");
});

check("engines.dsh covers every DSH release this plugin is verified against", () => {
  for (const version of ["0.2.1-rc.2", "0.2.1-rc.5", "0.2.2-rc.1", "0.2.2-rc.2", "0.2.2-rc.3", "0.3.0-rc.1", "0.3.0"]) {
    assert.equal(satisfies(version, enginesDsh), true, `engines.dsh rejects ${version}`);
  }
});

check("engines.dsh still rejects hosts outside the declared support line", () => {
  for (const version of ["0.1.6", "0.2.0-rc.1", "0.4.0-0", "0.4.0", "1.0.0"]) {
    assert.equal(satisfies(version, enginesDsh), false, `engines.dsh accepts ${version}`);
  }
});

check("every @deepseek-ai/dsh* peer keeps the same host line as engines.dsh", () => {
  assert.ok(peers.length > 0, "no DSH peer dependencies declared");
  for (const [name, range] of peers) {
    for (const version of ["0.2.1-rc.2", "0.2.2-rc.1", "0.2.2-rc.3", "0.3.0-rc.1", "0.3.0"]) {
      assert.equal(satisfies(version, range), true, `${name} rejects supported host ${version}`);
    }
    for (const version of ["0.1.6", "0.4.0-0", "0.4.0"]) {
      assert.equal(satisfies(version, range), false, `${name} accepts unsupported host ${version}`);
    }
  }
});

check("the market's AND of engines and peers has no unsatisfiable gap", () => {
  // Whatever the market reports to the user must agree with the gate for the
  // hosts this manifest claims: no version inside engines.dsh may be rejected
  // by a peer range.
  for (const version of ["0.2.1-rc.2", "0.2.1-rc.5", "0.2.2-rc.1", "0.2.2-rc.2", "0.2.2-rc.3", "0.3.0-rc.1", "0.3.0"]) {
    const accepted = satisfies(version, enginesDsh) && peers.every(([, range]) => satisfies(version, range));
    assert.equal(accepted, true, `market verdict disagrees with engines.dsh for ${version}`);
  }
});

check("dsh.compatibility.dshReleases names the verified releases", () => {
  const releases = pkg.dsh?.compatibility?.dshReleases ?? {};
  for (const version of ["0.2.1-rc.2", "0.2.2-rc.1", "0.2.2-rc.3"]) {
    assert.equal(releases[version], "compatible", `dshReleases does not mark ${version} compatible`);
  }
});

check("the client bundle version follows the package version", () => {
  const match = /const PLUGIN_VERSION = "([^"]+)";/.exec(client);
  assert.ok(match, "lib/client.js has no PLUGIN_VERSION");
  assert.equal(match[1], pkg.version, "lib/client.js PLUGIN_VERSION is stale");
});

console.log(`\nOK: ${checks} checks`);
