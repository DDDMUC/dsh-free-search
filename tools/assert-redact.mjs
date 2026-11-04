// Error text must never carry a credential into a tool result or a log line.
import assert from "node:assert/strict";
import { rememberSecret, forgetSecrets, redactSecrets, environmentSecrets } from "../lib/redact.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("a remembered key is scrubbed wherever it appears", () => {
  forgetSecrets();
  rememberSecret("sk-live-abcdefgh12345678");
  const text = redactSecrets("upstream said: key sk-live-abcdefgh12345678 is invalid");
  assert.equal(text.includes("abcdefgh12345678"), false);
  assert.match(text, /\*\*\*/);
});

check("known key shapes are scrubbed even without registration", () => {
  forgetSecrets();
  assert.equal(redactSecrets("bad token sk-proj-abcdef1234567890").includes("abcdef1234567890"), false);
  assert.match(redactSecrets("Authorization: Bearer abcdefgh12345678"), /Bearer \*\*\*/);
  assert.equal(redactSecrets("GET https://x.test/?api_key=supersecret123&q=1").includes("supersecret123"), false);
  assert.equal(redactSecrets('{"x-api-key":"topsecretvalue"}').includes("topsecretvalue"), false);
});

check("ordinary text and short values are left alone", () => {
  forgetSecrets();
  const message = "Baidu API error (HTTP 429): daily free quota exceeded";
  assert.equal(redactSecrets(message), message);
  rememberSecret("short");
  assert.equal(redactSecrets("short is not a key"), "short is not a key");
});

check("environment secrets are picked up by name", () => {
  const secrets = environmentSecrets({ EXA_API_KEY: "sk-exa-1234567890", PATH: "/usr/bin" });
  assert.deepEqual(secrets, ["sk-exa-1234567890"]);
});

console.log(`OK: ${checks} redact checks passed`);
