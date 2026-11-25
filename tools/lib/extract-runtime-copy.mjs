// 服务端源码里真实存在的「运行时输出」固定文字。
//
// 这个模块存在的唯一理由：设置页那个「运行时输出」区块显示的东西，
// 必须是 lib/ 里真实的模板字符串，而不是凭记忆手写的近似版本。
// 生成器（tools/gen-runtime-copy.mjs）与断言（tools/assert-runtime-copy.mjs）
// 都调用这里，所以「界面显示的东西」和「源码原文」不可能漂移。
import fs from "node:fs";

// 读一个模板字面量：from 指向开头的反引号，返回原文与结束位置。
function readTemplate(src, from) {
  let i = from + 1;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") { i += 2; continue; }
    if (depth === 0 && c === "`") return { text: src.slice(from + 1, i), end: i };
    if (c === "$" && src[i + 1] === "{") { depth += 1; i += 2; continue; }
    if (depth > 0 && c === "}") { depth -= 1; i += 1; continue; }
    if (depth > 0 && c === "`") { const inner = readTemplate(src, i); i = inner.end + 1; continue; }
    i += 1;
  }
  throw new Error("unterminated template literal");
}

// 往前找最近的工具注册块：`name: "tool_id"`（缩进比内部字段浅）。
function toolNameBefore(src, index) {
  const head = src.slice(0, index).split("\n");
  for (let i = head.length - 1; i >= 0; i -= 1) {
    // CRLF 检出时行尾会带 \r，正则末尾要容得下它。
    const m = head[i].trimEnd().match(/^\s{4,10}name: ["']([a-z_0-9]+)["'],?$/);
    if (m) return m[1];
  }
  return "";
}

// 模板第一行（源码里写的是 \n 两个字符，不是真换行）。
function firstLine(text) {
  const at = text.indexOf("\\n");
  return at < 0 ? text : text.slice(0, at);
}

const BOUNDARY = "<untrusted-web-content>";
const SCANNED = ["index.js", "research.js", "vertical.js"];

export function extractRuntimeCopy(root) {
  const indexSrc = fs.readFileSync(`${root}/lib/index.js`, "utf8");

  // ---- 置信度说明 -------------------------------------------------------
  // UNCERTAINTY_NOTES 是普通对象字面量，求值即可拿到 zh/en 两套。
  const notesAt = indexSrc.indexOf("const UNCERTAINTY_NOTES = {");
  if (notesAt < 0) throw new Error("UNCERTAINTY_NOTES not found");
  const notesEnd = indexSrc.indexOf("};", notesAt) + 2;
  const notes = new Function(
    `return (${indexSrc
      .slice(notesAt, notesEnd)
      .replace("const UNCERTAINTY_NOTES = ", "")
      .replace(/;$/, "")});`,
  )();

  // ---- 回退 Note -------------------------------------------------------
  // 源码里以 `Note: 开头的模板（固定英文，不跟语言开关）。
  const noteTemplates = [];
  let cursor = 0;
  while ((cursor = indexSrc.indexOf("`Note: ", cursor)) >= 0) {
    const t = readTemplate(indexSrc, cursor);
    noteTemplates.push(t.text);
    cursor = t.end;
  }

  // ---- 输出外壳 / 空结果占位 --------------------------------------------
  // 输出外壳 = 每个工具返回值的第一行；空结果占位 = 没有结果时的那句。
  const shells = [];
  const placeholders = [];
  for (const file of SCANNED) {
    const src = fs.readFileSync(`${root}/lib/${file}`, "utf8");
    const needle = 'type: "text", text: ';
    let at = 0;
    while ((at = src.indexOf(needle, at)) >= 0) {
      const start = at + needle.length;
      if (src[start] !== "`") { at = start; continue; }
      const t = readTemplate(src, start);
      const tool = toolNameBefore(src, at);
      const text = firstLine(t.text);
      if (text.startsWith("No ")) placeholders.push({ tool, text });
      else shells.push({ tool, text });
      at = t.end;
    }
    // 空结果占位有写在字符串字面量里的（`|| "No results found."`），单独扫。
    for (const m of src.matchAll(/"No results?(?: found)?\."/g)) {
      placeholders.push({ tool: "", text: m[0].slice(1, -1) });
    }
  }

  // ---- 天气的表头 ------------------------------------------------------
  // formatWeather 按语言拼表头，不在 type:"text" 模板里。
  const weatherSrc = fs.readFileSync(`${root}/lib/weather.js`, "utf8");
  const wAt = weatherSrc.indexOf("export function formatWeather");
  const wEnd = weatherSrc.indexOf("export async function geocodeLocation", wAt);
  const wBody = weatherSrc.slice(wAt, wEnd);
  let pos = 0;
  while ((pos = wBody.indexOf("lines.push(`", pos)) >= 0) {
    const t = readTemplate(wBody, pos + "lines.push(".length);
    if (/(天气：|の天気：|Weather for )/.test(t.text)) {
      shells.push({ tool: "weather", text: t.text });
    }
    pos = t.end;
  }

  return {
    notes,
    noteTemplates,
    // 同一个占位句可能在多个工具里重复，展示时去重更省地方。
    placeholders: [...new Set(placeholders.map((p) => p.text))].map((text) => ({ text })),
    shells,
    boundary: [BOUNDARY, `</${BOUNDARY.slice(1)}`],
  };
}
