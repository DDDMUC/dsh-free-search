// tools/assert-free-search-test-schema.mjs — free_search_test 的输出 schema 与真实产出必须一致。
// 背景：auto / multi 虚拟模式分支会额外产出 engineUsed / note；若 output.schema 未声明这两个字段，
// DSH 核心的 json-schema 校验会因 additionalProperties: false 判整条结果非法，工具输出整体被丢弃。
// 运行：node tools/assert-free-search-test-schema.mjs [path/to/lib/index.js]
// 默认校验 ../lib/index.js；传旧版文件路径可复现修复前的失败。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(process.argv[2] ?? resolve(here, "../lib/index.js"));
const source = readFileSync(target, "utf8");

let pass = 0;
const failures = [];
const assert = (cond, name) => {
  if (cond) { pass += 1; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name); }
};
const section = (t) => console.log("\n== " + t + " ==");

// 从源码里抠出指定工具的 output.schema 字面量（大括号配对，跳过字符串）
function extractToolSchema(text, toolName) {
  const nameAt = text.indexOf(`name: "${toolName}"`);
  if (nameAt < 0) throw new Error(`抽取失败：找不到工具 ${toolName}`);
  const outputAt = text.indexOf("output: {", nameAt);
  if (outputAt < 0) throw new Error(`抽取失败：${toolName} 没有 output 块`);
  const schemaAt = text.indexOf("schema: {", outputAt);
  if (schemaAt < 0) throw new Error(`抽取失败：${toolName} 没有 output.schema`);
  const open = text.indexOf("{", schemaAt);
  let depth = 0;
  let quote = null;
  let escape = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return new Function("return (" + text.slice(open, i + 1) + ")")();
    }
  }
  throw new Error("抽取失败：output.schema 大括号不配对");
}

// 复刻 DSH 用到的 JSON-Schema 子集：type / properties / required / additionalProperties / items
function validate(schema, value, path, violations) {
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      violations.push(`"${path}" expected object`);
      return;
    }
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) violations.push(`missing required property "${path}.${key}"`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) {
          violations.push(`"${path}.${key}" is not a declared property (additionalProperties: false)`);
        }
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (value[key] !== undefined) validate(child, value[key], `${path}.${key}`, violations);
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) { violations.push(`"${path}" expected array`); return; }
    if (schema.items) value.forEach((item, i) => validate(schema.items, item, `${path}[${i}]`, violations));
    return;
  }
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (schema.type && actual !== schema.type) violations.push(`"${path}" expected ${schema.type}, got ${actual}`);
}

const schema = extractToolSchema(source, "free_search_test");
const check = (name, payload) => {
  const violations = [];
  validate(schema, { results: [payload] }, "value", violations);
  assert(violations.length === 0, violations.length === 0 ? name : `${name} -> ${violations.join("; ")}`);
};

section("A. 普通引擎的结果项");
check("ok 项（engine/status/results + sampleTitle/sampleUrl）",
  { engine: "tavily", status: "ok", results: 2, sampleTitle: "标题", sampleUrl: "https://example.com" });
check("fail 项（error + failureClass）",
  { engine: "firecrawl", status: "fail", error: "HTTP 403", failureClass: "auth" });
check("disabled 项", { engine: "ddg", status: "disabled" });

section("B. 虚拟模式 auto / multi 的结果项（本次 bug 现场）");
check("multi：engineUsed + note",
  { engine: "multi", status: "ok", results: 2, engineUsed: "tavily", note: "provider note" });
check("auto：engineUsed（provider 未返回 content 时无 note）",
  { engine: "auto", status: "ok", results: 2, engineUsed: "exa" });
check("multi 全失败：error",
  { engine: "multi", status: "fail", error: "0 results" });

section("C. 源码仍真的产出这些字段（防止断言与产出脱节）");
assert(/engineUsed:/.test(source), "execute() 仍写入 engineUsed");
assert(/item\.note\s*=/.test(source), "execute() 仍写入 note");

console.log("");
if (failures.length === 0) console.log(`OK: ${pass} assertions passed`);
else {
  console.log(`FAILED: ${failures.length} of ${pass + failures.length}`);
  for (const f of failures) console.log("  - " + f);
  process.exitCode = 1;
}
