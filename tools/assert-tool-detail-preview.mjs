// 工具行「详情」展开区：只读预览模型真正读到的 description + 参数说明。
//
// 关键约束：预览必须与服务端 prompt_i18n.js 的 TOOLS 表逐字一致，否则用户看到的
// 又不是模型读到的了。这里直接比对两边。
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8");
const pi = await import(new URL("lib/prompt_i18n.js", root));
const idx = await import(new URL("lib/index.js", root));
const domain = await import(new URL("lib/domain_engines.js", root));

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

const ENGINE_IDS_PROMPT = idx.ALL_ENGINES.join(", ");

// 从 bundle 里取出内联的 TOOL_COPY
const at = client.indexOf("const TOOL_COPY = ");
assert.ok(at > 0, "TOOL_COPY is missing from the client bundle");
const line = client.slice(at, client.indexOf("\n", at));
const inline = JSON.parse(line.slice(line.indexOf("= ") + 2, line.lastIndexOf(";")));

check("工具详情是内联的只读副本，覆盖全部 9 个工具、两种语言", () => {
  assert.deepEqual(Object.keys(inline.zh), idx.TOOL_IDS);
  assert.deepEqual(Object.keys(inline.en), idx.TOOL_IDS);
});

await check("内联文案与服务端逐字一致（description + 每个参数）", () => {
  const diffs = [];
  // 与服务端注册处同样的插值变量，缺一个就会渲染成 undefined
  const VARS = {
    "free_search_test.engines": { ids: ENGINE_IDS_PROMPT },
    "advanced_search.engine": { ids: ENGINE_IDS_PROMPT },
    "multi_search.maxResults": { limit: 20 },
    "domain_search.engine": { ids: Object.keys(domain.ENGINES).join(", ") },
  };
  for (const lang of ["zh", "en"]) {
    for (const id of idx.TOOL_IDS) {
      if (inline[lang][id].description !== pi.toolDescription(lang, id)) diffs.push(`${lang}/${id}.description`);
      for (const name of Object.keys(pi.toolCopy(lang, id).params)) {
        const want = pi.toolParam(lang, id, name, VARS[`${id}.${name}`] ?? {});
        if (inline[lang][id].params[name]?.description !== want) diffs.push(`${lang}/${id}.${name}`);
      }
    }
  }
  assert.deepEqual(diffs, [], `preview drifted from the server copy: ${diffs.join(", ")}`);
});

await check("预览里不出现 undefined / null 之类未插值的痕迹", () => {
  const bad = [];
  for (const lang of ["zh", "en"]) {
    for (const [id, t] of Object.entries(inline[lang])) {
      if (/\bundefined\b/.test(t.description)) bad.push(`${lang}/${id}.description`);
      for (const [name, p] of Object.entries(t.params)) {
        if (/\bundefined\b/.test(p.description)) bad.push(`${lang}/${id}.${name}`);
      }
    }
  }
  assert.deepEqual(bad, [], `unescaped interpolation: ${bad.join(", ")}`);
});

check("展开区不进入提示词（它只是界面）", () => {
  // 预览用的副本不能出现在注入路径里：composeInjectedPrompt / buildBuiltinPromptBlocks
  const inject = idx.composeInjectedPrompt({
    provider: "multi",
    allowedEngines: idx.ALL_ENGINES,
    promptLanguage: "zh",
    promptToolsLang: "zh",
  });
  assert.equal(inject.includes(inline.zh.multi_search.description), false, "the preview must not be injected");
});

check("工具行有展开按钮与只读展开区", () => {
  assert.match(client, /className: "dshfs-toolToggle"/);
  assert.match(client, /className: "dshfs-toolBody"/);
  assert.match(client, /"aria-expanded": expanded/);
});

check("展开状态是纯界面状态，不写配置", () => {
  assert.match(client, /const \[expandedTool, setExpandedTool\] = react\.useState\(null\)/);
  // 展开/收起的点击只改界面状态。复选框的 onChange 才置 dirty —— 所以只检查
  // 展开按钮那一段的 onClick，而不是整行。
  const at = client.indexOf('className: "dshfs-toolToggle"');
  const end = client.indexOf("children: [\"详情\"", at);
  const onClick = client.slice(at, end);
  assert.ok(onClick.includes("setExpandedTool"), "the toggle must flip the expanded state");
  assert.equal(/setDirty\(true\)/.test(onClick), false, "expanding a tool must not dirty the form");
  assert.equal(/ops\.push/.test(onClick), false, "expanding a tool must not write settings");
});

console.log(`OK: ${checks} tool-detail preview checks passed`);
