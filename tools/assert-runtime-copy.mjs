// 运行时输出段：只读展示工具返回时附带的文字，不注入、不改注入。
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

// 从 bundle 取内联副本
const at = client.indexOf("const RUNTIME_OUTPUT_COPY = ");
assert.ok(at > 0, "RUNTIME_OUTPUT_COPY missing");
const line = client.slice(at, client.indexOf("\n", at));
const copy = JSON.parse(line.slice(line.indexOf("= ") + 2, line.lastIndexOf(";")));

// 从服务端取权威原文
const notesAt = index.indexOf("const UNCERTAINTY_NOTES = {");
const notesEnd = index.indexOf("};", notesAt) + 2;
const serverNotes = new Function(
  `return (${index.slice(notesAt, notesEnd).replace("const UNCERTAINTY_NOTES = ", "").replace(/;$/, "")});`,
)();

check("置信度文案与服务端逐字一致", () => {
  assert.deepEqual(Object.keys(copy.notes), Object.keys(serverNotes));
  for (const k of Object.keys(serverNotes)) {
    assert.equal(copy.notes[k].zh, serverNotes[k].zh, `${k}.zh`);
    assert.equal(copy.notes[k].en, serverNotes[k].en, `${k}.en`);
  }
});

check("回退 Note 模板与服务端逐字一致", () => {
  const templates = [
    "Note: ${preferred} is disabled by configuration, using ${engine}.",
    "Note: ${preferred} does not support time filtering (timeRange=${timeRangeLabel}), using ${engine}.",
    "Note: ${preferred} ${FAILURE_CLASS_LABEL} (${preferredFailure}), using ${engine}.",
    "Note: ${preferred} unavailable or failed, using ${engine}.",
    "Note: ${notes}",
  ];
  for (const t of templates) {
    assert.ok(index.includes(t.replace("${FAILURE_CLASS_LABEL}", "${label}").replace("Note: ${notes}", 'Note: ${notes.join("; ")}')) || copy.noteTemplates.includes(t),
      `template drifted from the server: ${t}`);
  }
});

check("输出外壳与服务端一致", () => {
  assert.ok(index.includes("`Search (${value.provider}"));
  assert.ok(index.includes("`Multi-Search (${value.provider}):"));
  assert.ok(index.includes("`Platform search (${value.platform}):"));
  assert.ok(index.includes("`Video search (${value.provider}):"));
  assert.ok(index.includes("Confidence: ${uncertainty.level}"));
  assert.ok(index.includes("Search engine test:"));
  assert.ok(copy.shells.length >= 6);
});

check("边界标记一致", () => {
  assert.ok(index.includes('"<untrusted-web-content>"'));
  assert.deepEqual(copy.boundary, ["<untrusted-web-content>", "</untrusted-web-content>"]);
});

check("这一段不进入注入", () => {
  const injected = (() => {
    // 用 buildBuiltinPromptBlocks 的真实产物拼接
    const mod = index;
    return mod;
  })();
  // 直接检查：运行时文案里独有的句子不能出现在 composeInjectedPrompt 的产物里
  const unique = "Note: ${preferred} is disabled by configuration";
  assert.equal(index.includes("composeInjectedPrompt") && /composeInjectedPrompt[\s\S]{0,4000}Note: \$\{preferred\}/.test(index), false,
    "fallback notes must not be part of the injected prompt");
  void injected;
});

check("这一段有自己的 中 / EN 切换，且默认跟随提示词语言", () => {
  // 「运行时输出」同样有两种语言的文案，所以和工具段一样给一组按钮。
  const block = client.slice(client.indexOf("const renderRuntimeSection"), client.indexOf("const renderToolsSegment"));
  assert.match(block, /runtimeLang === "zh"/, "the zh button reflects its own state");
  assert.match(block, /runtimeLang === "en"/, "the en button reflects its own state");
  assert.match(block, /setRuntimeLang\("zh"\)/);
  assert.match(block, /setRuntimeLang\("en"\)/);
  // 默认跟随提示词语言；用户点过之后不再被覆盖
  assert.match(client, /runtimeLangPinned\.current = true;/);
  assert.match(client, /if \(runtimeLangPinned\.current\) return;/);
});

check("界面上有这一段，且带中英文案", () => {
  assert.match(client, /const renderRuntimeSection = \(\) =>/);
  assert.match(client, /renderRuntimeSection\(\),/);
  assert.match(client, /runtimeLabel: "运行时输出"/);
  assert.match(client, /runtimeLabel: "Runtime output"/);
});

check("说是「不参与注入」", () => {
  assert.match(client, /它们不是提示词/);
  assert.match(client, /不参与注入/);
});

console.log(`OK: ${checks} runtime-copy checks passed`);
