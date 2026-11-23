// #161: the host truncates HTML to `fetchMaxOutputChars` (200,000 by default)
// BEFORE turndown conversion. Sites that put hundreds of KB of inline CSS in
// <head> therefore lose their body and web_fetch returns just the <title>.
//
// The fix is to strip what turndown discards anyway (style/script/noscript/
// comments/oversized data:) so the character budget goes to the body instead.
import assert from "node:assert/strict";
import { slimHtml } from "../lib/fetch_provider.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

// The host's budget, and the same order of operations it uses.
const HOST_BUDGET = 200_000;
const firstChars = (html) => html.slice(0, HOST_BUDGET);

check("style, script and comment blocks are removed", () => {
  const html = `<html><head><style>.a{color:red}</style><script>var x=1;</script><!-- note --></head><body><p>Hi</p></body></html>`;
  const slim = slimHtml(html);
  assert.doesNotMatch(slim, /<style/i);
  assert.doesNotMatch(slim, /<script/i);
  assert.doesNotMatch(slim, /<!--/);
  assert.match(slim, /<p>Hi<\/p>/, "visible content survives");
});

check("noscript is removed too", () => {
  const slim = slimHtml(`<body><p>A</p><noscript><img src="x.png"></noscript></body>`);
  assert.doesNotMatch(slim, /<noscript/i);
  assert.match(slim, /<p>A<\/p>/);
});

check("only oversized data: payloads are stripped", () => {
  const big = "A".repeat(600);
  const slim = slimHtml(`<body><img src="data:image/png;base64,${big}"><img src="data:image/png;base64,AA"></body>`);
  assert.match(slim, /src=""/, "the oversized one is emptied");
  assert.match(slim, /src="data:image\/png;base64,AA"/, "a short inline icon is left alone");
});

check("a normal page is left essentially untouched", () => {
  const html = `<html><head><title>T</title></head><body><h1>H</h1><p>Some text.</p></body></html>`;
  const slim = slimHtml(html);
  assert.equal(slim, html, "nothing to strip means byte-for-byte identical");
});

check("a style-heavy page keeps its article within the host budget", () => {
  // 260 KB of inline CSS before the body — the Guardian shape (its <body> starts
  // at 202,287, past the 200,000 budget).
  const css = ".x{color:red}\n".repeat(260_000 / 14);
  const article = "The dodo was a flightless bird endemic to Mauritius.";
  const html = `<html><head><style>${css}</style></head><body><article><p>${article}</p></article></body></html>`;

  // Current behaviour: the budget is consumed inside <head>.
  assert.equal(
    firstChars(html).includes(article),
    false,
    "without slimming the article sits past the budget"
  );
  // After slimming, the article is well inside it.
  assert.equal(firstChars(slimHtml(html)).includes(article), true);
});

check("slimming is idempotent", () => {
  const html = `<html><head><style>.a{}</style></head><body><p>x</p></body></html>`;
  const once = slimHtml(html);
  assert.equal(slimHtml(once), once, "running it twice must not change anything");
});

check("a multi-hundred-character script body is removed whole", () => {
  const script = `var payload = "${"x".repeat(5000)}";`;
  const slim = slimHtml(`<body><script type="module">${script}</script><p>keep</p></body>`);
  assert.doesNotMatch(slim, /payload/, "the script body must not leak into the markdown");
  assert.match(slim, /<p>keep<\/p>/);
});

check("case-insensitive and multiline blocks are handled", () => {
  const slim = slimHtml(`<STYLE\n type="text/css">\n.a{}\n</STYLE><Script>\nx()\n</SCRIPT><p>ok</p>`);
  assert.doesNotMatch(slim, /<style/i);
  assert.doesNotMatch(slim, /<script/i);
  assert.match(slim, /<p>ok<\/p>/);
});

check("template blocks are removed", () => {
  const slim = slimHtml(`<body><template id="row"><li>hidden row</li></template><p>visible</p></body>`);
  assert.doesNotMatch(slim, /<template/i, "template content is never rendered but does eat the budget");
  assert.doesNotMatch(slim, /hidden row/);
  assert.match(slim, /<p>visible<\/p>/);
});

// 注意：slimHtml 处理的是服务端发回的完整 HTML，不是被宿主截断过的片段。
// "未闭合块" 只会出现在截断之后，属于宿主的责任，这里不模拟。

console.log(`OK: ${checks} HTML slim checks passed`);
