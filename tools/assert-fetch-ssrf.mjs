// SSRF guard: web_fetch must never reach loopback, private networks or metadata.
import assert from "node:assert/strict";
import { assertPublicUrl, isAddressAllowed, isPublicAddress } from "../lib/ssrf.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const privateLookup = async () => [{ address: "10.0.0.7", family: 4 }];
const fakeIpLookup = async () => [{ address: "198.18.0.44", family: 4 }];

await check("public addresses pass, private and reserved ranges fail", () => {
  for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
    assert.equal(isPublicAddress(address), true, address);
  }
  for (const address of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "0.0.0.0", "192.0.2.1", "198.18.0.1",
    "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1",
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

await check("fake-ip ranges are blocked by default and allowed only when listed", () => {
  assert.equal(isPublicAddress("198.18.0.44"), false);
  assert.equal(isPublicAddress("198.18.0.44", { allowedCidrs: ["198.18.0.0/15"] }), true);
  assert.equal(isPublicAddress("198.19.255.255", { allowedCidrs: ["198.18.0.0/15"] }), true);
  assert.equal(isAddressAllowed("198.18.0.44", ["198.18.0.0/15"]), true);
  assert.equal(isAddressAllowed("198.20.0.1", ["198.18.0.0/15"]), false);
  // the opt-in must not weaken the ranges that matter, even when listed explicitly
  for (const address of ["127.0.0.1", "10.0.0.7", "192.168.1.1", "169.254.169.254", "::1", "fc00::1"]) {
    assert.equal(isPublicAddress(address, { allowedCidrs: ["0.0.0.0/0", "::/0"] }), false, address);
  }
});

await check("a fake-ip host passes only with the matching CIDR", async () => {
  await assert.rejects(() => assertPublicUrl("https://docs.example.test/", { lookup: fakeIpLookup }), /SSRF blocked/);
  const url = await assertPublicUrl("https://docs.example.test/", { lookup: fakeIpLookup, allowedCidrs: ["198.18.0.0/15"] });
  assert.equal(url.hostname, "docs.example.test");
  await assert.rejects(
    () => assertPublicUrl("https://docs.example.test/", { lookup: fakeIpLookup, allowedCidrs: ["203.0.113.0/24"] }),
    /SSRF blocked/
  );
});

await check("public hosts resolve and pass", async () => {
  const url = await assertPublicUrl("https://example.com/a?b=1", { lookup: publicLookup });
  assert.equal(url.hostname, "example.com");
});

await check("a host resolving to a private address is blocked", async () => {
  await assert.rejects(() => assertPublicUrl("https://evil.test/", { lookup: privateLookup }), /SSRF blocked/);
});

await check("localhost and IP literals are blocked without DNS", async () => {
  await assert.rejects(() => assertPublicUrl("https://127.0.0.1/", { lookup: publicLookup }), /private address/);
  await assert.rejects(() => assertPublicUrl("https://[::1]/", { lookup: publicLookup }), /private address/);
  await assert.rejects(() => assertPublicUrl("https://localhost/", { lookup: privateLookup }), /SSRF blocked/);
});

await check("non-HTTPS and credential URLs are rejected", async () => {
  await assert.rejects(() => assertPublicUrl("http://example.com/", { lookup: publicLookup }), /only https/);
  await assert.rejects(() => assertPublicUrl("https://user:pass@example.com/", { lookup: publicLookup }), /credentials/);
});

await check("the provider wires the guard and both settings", async () => {
  const fs = await import("node:fs");
  const provider = fs.readFileSync(new URL("../lib/fetch_provider.js", import.meta.url), "utf8");
  assert.match(provider, /validateUrl = assertPublicUrl/);
  assert.match(provider, /await validateUrl\(url, \{ allowedCidrs: allowed \}\)/);
  assert.match(provider, /lookup: makeSafeLookup\(allowed\)/);
  assert.match(provider, /browserEnabled\(\) && browserPath/);
  assert.match(provider, /prefer\(\) === "firecrawl"/);
  const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(index, /browserFetch: z\.boolean\(\)\.default\(true\)/);
  assert.match(index, /allowFakeIpCidrs: z\.array\(z\.string\(\)\)/);
  assert.match(index, /fetchPrefer: z\.string\(\)\.default\("exa"\)/);
  const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /t\.browserFetchLabel/);
  assert.match(client, /t\.fakeIpCidrsLabel/);
  assert.match(client, /path: \["allowFakeIpCidrs"\]/);
  assert.match(client, /path: \["fetchPrefer"\]/);
});

console.log(`OK: ${checks} fetch-ssrf checks passed`);
