// Bridge Host fence (#84): loopback, trusted hosts, public URL, bind address. No network.
// Node >= 20: node tools/assert-bridge-access.mjs
import assert from "node:assert/strict";

const { isBridgeRequestAllowed } = await import("../lib/index.js");
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`  ok  ${name}`); };

const request = ({ host, remote = "127.0.0.1", local = "127.0.0.1", origin, site }) => ({
  headers: {
    host,
    ...(origin === undefined ? {} : { origin }),
    ...(site === undefined ? {} : { "sec-fetch-site": site }),
  },
  socket: { remoteAddress: remote, localAddress: local },
});
const trust = (hosts = [], publicHost = "") => ({ hosts, publicHost });

check("loopback peer + loopback Host is allowed", () => {
  assert.equal(isBridgeRequestAllowed(request({ host: "127.0.0.1:3080" }), trust()), true);
  assert.equal(isBridgeRequestAllowed(request({ host: "localhost:3080" }), trust()), true);
  assert.equal(isBridgeRequestAllowed(request({ host: "[::1]:3080", remote: "::1", local: "::1" }), trust()), true);
});

check("any 127/8 address counts as loopback", () => {
  assert.equal(isBridgeRequestAllowed(request({ host: "127.0.0.2:3080", remote: "127.0.0.2" }), trust()), true);
});

check("a loopback Host reached from a remote peer is refused", () => {
  assert.equal(isBridgeRequestAllowed(request({ host: "127.0.0.1:3080", remote: "203.0.113.9" }), trust()), false);
});

check("a declared trusted host is allowed without a port", () => {
  assert.equal(
    isBridgeRequestAllowed(request({ host: "harness.example.com", remote: "203.0.113.9" }), trust(["harness.example.com"])),
    true
  );
  assert.equal(
    isBridgeRequestAllowed(request({ host: "harness.example.com:443", remote: "203.0.113.9" }), trust(["harness.example.com"])),
    true
  );
});

check("a trusted host with an explicit port matches that port only", () => {
  const rule = trust(["harness.example.com:8443"]);
  assert.equal(isBridgeRequestAllowed(request({ host: "harness.example.com:8443", remote: "203.0.113.9" }), rule), true);
  assert.equal(isBridgeRequestAllowed(request({ host: "harness.example.com", remote: "203.0.113.9" }), rule), false);
  assert.equal(isBridgeRequestAllowed(request({ host: "harness.example.com:443", remote: "203.0.113.9" }), rule), false);
});

check("a configured public URL is allowed", () => {
  assert.equal(
    isBridgeRequestAllowed(request({ host: "dsh.example.com", remote: "203.0.113.9" }), trust([], "dsh.example.com")),
    true
  );
});

check("a Host equal to the bind address is allowed", () => {
  assert.equal(
    isBridgeRequestAllowed(request({ host: "192.168.1.5:3080", local: "192.168.1.5", remote: "192.168.1.20" }), trust()),
    true
  );
});

check("an unknown Host is refused", () => {
  assert.equal(isBridgeRequestAllowed(request({ host: "evil.example.com", remote: "203.0.113.9" }), trust()), false);
});

check("cross-site requests are refused even on loopback", () => {
  assert.equal(isBridgeRequestAllowed(request({ host: "127.0.0.1:3080", site: "cross-site" }), trust()), false);
});

check("a foreign Origin is refused", () => {
  assert.equal(
    isBridgeRequestAllowed(request({ host: "127.0.0.1:3080", origin: "https://evil.example.com" }), trust()),
    false
  );
  assert.equal(
    isBridgeRequestAllowed(request({ host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" }), trust()),
    true
  );
});

check("hostnames compare case-insensitively", () => {
  assert.equal(
    isBridgeRequestAllowed(request({ host: "HARNESS.example.com", remote: "203.0.113.9" }), trust(["harness.example.com"])),
    true
  );
});

console.log(`OK: ${checks} bridge access checks passed`);
