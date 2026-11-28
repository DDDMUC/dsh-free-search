// #170: web_fetch on a PDF used to "succeed" with an empty body.
//
// The headless browser's --dump-dom on a PDF returns the reader's shell (toolbar,
// page controls, canvas), which is far longer than the 300-char gate. The shell
// was handed to the host as "the page", the host converted that shell to Markdown
// and got nothing, and firecrawl — the tier that can actually read a PDF — never
// ran. Two guards are pinned here: the tier is skipped when the target is a PDF,
// and a dumped shell is recognised even when nothing told us it was a PDF.
import { createFetchProvider, isPdfTarget, isPdfContentType, looksLikePdfViewerShell } from "../lib/fetch_provider.js";
import { CONTROLLED_STUBS } from "../lib/fetch_upstream.js";

let pass = 0;
const failures = [];
const assert = (cond, name) => {
  if (cond) { pass += 1; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name); }
};
const section = (t) => console.log("\n== " + t + " ==");

section("A. PDF 判据");
assert(isPdfTarget("https://example.test/doc.pdf") === true, "plain .pdf URL");
assert(isPdfTarget("https://example.test/doc.pdf?download=1") === true, "query string is ignored");
assert(isPdfTarget("https://example.test/doc.pdf#page=3") === true, "fragment is ignored");
assert(isPdfTarget("https://example.test/DOC.PDF") === true, "case-insensitive");
assert(isPdfTarget("https://example.test/a/b/c.PdF") === true, "nested path");
assert(isPdfTarget("https://example.test/pdf-reader") === false, "a page that merely mentions pdf is not a PDF");
assert(isPdfTarget("https://example.test/doc.pdf.html") === false, ".pdf.html is an HTML page");
assert(isPdfTarget("https://example.test/paper") === false, "an extensionless URL is not a PDF by URL alone");
assert(isPdfTarget("not a url") === false, "garbage never throws");

assert(isPdfContentType("application/pdf") === true, "content-type application/pdf");
assert(isPdfContentType("application/pdf; charset=binary") === true, "parameters are ignored");
assert(isPdfContentType("text/html") === false, "text/html is not a PDF");

section("B. 阅读器外壳识别");
// 浏览器内置 PDF viewer 的扩展 id 出现在 dump 出来的 DOM 里。
const shell = `<html><body><div id="viewer"><embed type="application/pdf" src="chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html"></div></body></html>`;
assert(looksLikePdfViewerShell(shell) === true, "chrome's built-in viewer is recognised");
const pdfjs = `<html><body><div class="pdfViewer"><canvas id="page1"></canvas></div></body></html>`;
assert(looksLikePdfViewerShell(pdfjs) === true, "a pdf.js viewer is recognised");
const article = `<html><body><article><h1>Real article</h1><p>${"text ".repeat(80)}</p></article></body></html>`;
assert(looksLikePdfViewerShell(article) === false, "an ordinary article is not mistaken for a shell");

section("C. PDF 目标跳过浏览器层，交给能解析 PDF 的层");
const calls = { browser: 0, firecrawl: 0 };
const provider = createFetchProvider({
  resolveApiKey: async (env) => (env === "FIRECRAWL_API_KEY" ? "k" : undefined),
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  validateUrl: async () => {},
  // 只要这一层被调用就记一笔：PDF 目标绝不该走到它。
  browserEnabled: () => true,
  browserPath: () => "C:/fake/browser.exe",
  prefer: () => "firecrawl",
});
for (const k of Object.keys(CONTROLLED_STUBS)) CONTROLLED_STUBS[k] = null;
CONTROLLED_STUBS.firecrawl = async () => { calls.firecrawl += 1; return "p".repeat(500); };

const result = await provider.fetch({ url: "https://example.test/paper.pdf" }, undefined);
assert(result.statusCode === 200 && result.body.kind === "text", "firecrawl answers the PDF fetch");
assert(calls.firecrawl === 1, `firecrawl ran exactly once (${calls.firecrawl})`);

section("D. 非 PDF 目标仍然可以使用浏览器层");
// 这一条防的是「顺手把浏览器层关掉」——只有 PDF 该跳过。
// 用 HEAD/直连失败的真实响应太依赖网络，这里直接比对错误串：非 PDF 的失败原因里
// 不能出现「skipped (target is a PDF)」，PDF 的必须有。
const pdfProvider = createFetchProvider({
  resolveApiKey: async () => undefined,
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  validateUrl: async () => {},
  browserEnabled: () => false,
  prefer: () => "exa",
});
for (const k of Object.keys(CONTROLLED_STUBS)) CONTROLLED_STUBS[k] = null;
let pdfError = "";
try { await pdfProvider.fetch({ url: "https://example.invalid/paper.pdf" }, undefined); } catch (e) { pdfError = String(e.message); }
assert(/skipped \(target is a PDF/.test(pdfError), `a PDF records the skip reason (${pdfError.slice(0, 120)})`);

let textError = "";
try { await pdfProvider.fetch({ url: "https://example.invalid/article" }, undefined); } catch (e) { textError = String(e.message); }
assert(!/skipped \(target is a PDF/.test(textError), "a non-PDF target never records the PDF skip");

console.log("");
if (failures.length === 0) console.log(`OK: ${pass} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
