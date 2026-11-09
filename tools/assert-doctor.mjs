// The doctor report explains, per engine, why it is not being used.
import assert from "node:assert/strict";
import { buildDoctorReport, formatDuration } from "../lib/doctor.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const NOW = Date.parse("2026-11-04T00:00:00Z");

const report = buildDoctorReport({
  version: "9.9.9",
  nodeVersion: "24.0.0",
  dshHome: "C:/home/.dsh",
  provider: "",
  effectiveProvider: "parallel",
  searchProvider: "ddg",
  fetchProvider: "fs-quality-fetch",
  promptLanguage: "zh",
  promptChars: 1951,
  promptInjected: true,
  tools: { enabled: [], disabled: ["domain_search"] },
  toolsKnown: ["free_search_test", "domain_search"],
  now: NOW,
  engines: [
    { id: "bing", disabled: false, credential: { required: false, configured: true, envs: [] }, cooling: null, stats: { calls: 4, ok: 3, empty: 1, fail: 0, avgMs: 250, lastErrorClass: "" } },
    { id: "exa", disabled: false, credential: { required: true, configured: true, envs: ["EXA_API_KEY"] }, cooling: null },
    { id: "tavily", disabled: false, credential: { required: true, configured: false, envs: ["TAVILY_API_KEY"] }, cooling: null },
    { id: "parallel", disabled: false, credential: { required: false, configured: true, envs: [] }, cooling: { remainingMs: 12 * 60_000, cls: "quota", reason: "quota exceeded" } },
    { id: "ddg", disabled: true, credential: { required: false, configured: true, envs: [] }, cooling: null },
  ],
});

check("durations are human", () => {
  assert.equal(formatDuration(30_000), "30s");
  assert.equal(formatDuration(12 * 60_000), "12m");
  assert.equal(formatDuration(3 * 3_600_000), "3h");
  assert.equal(formatDuration(2 * 86_400_000), "2d");
  assert.equal(formatDuration(null), "session");
});

check("the header names the version, node, home and the resolved default", () => {
  assert.match(report, /^dsh-free-search 9\.9\.9/m);
  assert.match(report, /node 24\.0\.0 · C:\/home\/\.dsh/);
  assert.match(report, /preferred: auto \(resolves to parallel\) · prompt zh, 1951 chars/);
  assert.match(report, /tools: 1\/2 on \(free_search_test\)/);
});

check("each engine gets a mark and a reason", () => {
  assert.match(report, /^  \* bing +ready$/m);
  assert.match(report, /calls 4 · ok 3 · empty 1 · fail 0 · avg 250ms/);
  assert.match(report, /^  \* exa +key ok \(EXA_API_KEY\)$/m);
  assert.match(report, /^ +tavily +needs TAVILY_API_KEY$/m);
  assert.match(report, /^ +parallel +cooling 12m \[quota\]$/m);
  assert.match(report, /^ +ddg +disabled$/m);
});

check("cooldown reasons are listed once", () => {
  assert.match(report, /cooldown reasons:\n {2}parallel: quota exceeded/);
});

check("foreign providers are reported as a warning", () => {
  const warned = buildDoctorReport({ version: "1", nodeVersion: "24", searchProvider: "argo", fetchProvider: "other" });
  assert.match(warned, /providers: search=argo · fetch=other/);
  assert.match(warned, /mutually exclusive/);
});

check("a missing prompt section is called out", () => {
  const empty = buildDoctorReport({ version: "1", nodeVersion: "24", provider: "bing", promptChars: 0, promptInjected: false, engines: [] });
  assert.match(empty, /not injected/);
});

console.log(`OK: ${checks} doctor checks passed`);
