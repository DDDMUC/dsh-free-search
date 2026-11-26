// 模块之间横线：七个分区的第一个控件带 data-dsh-sep="above"，第一个分区（引擎）不带，
// 所以页首不会凭空多一条线。
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

const MARKER = /"data-dsh-sep": "above",/g;

check("the separator is a real rule, not a comment", () => {
  assert.match(
    client,
    /\.dshfs-body>div\[data-dsh-sep=above\]\{border-top:1px solid rgba\(0,0,0,\.09\);padding-top:20px;margin-top:2px\}/,
    "the rule that draws the line is missing",
  );
  // 深色模式也要有线，否则暗色下分隔消失。
  assert.match(
    client,
    /@media \(prefers-color-scheme: dark\)\{\.dshfs-body>div\[data-dsh-sep=above\]\{border-top-color:rgba\(255,255,255,\.1\)\}\}/,
  );
});

check("exactly the modules after the first carry the marker", () => {
  // 八个模块：引擎 / 回退 / 语言池 / 搜索行为 / 抓取 / 性能 / 提示词管理 / 扩展。
  // 引擎是第一个，上方不需要线；其余七个各一条。
  const count = (client.match(MARKER) ?? []).length;
  assert.equal(count, 7, `expected 7 separators, found ${count}`);
});

check("each marker sits on a module's first field, not inside one", () => {
  const sectionAt = (id) => client.indexOf(`"data-dsh-section": "${id}"`);
  for (const id of ["fallback", "behavior", "fetch", "performance", "prompt", "extensions"]) {
    const at = sectionAt(id);
    assert.ok(at > 0, `section ${id} missing`);
    // 标记必须出现在 section 属性之后、children 之前这一小段里。
    const window = client.slice(at - 400, at + 60);
    assert.ok(window.includes(`"data-dsh-sep": "above",`), `section ${id} has no separator`);
  }
  // 引擎那一段不该有标记（页首不画线）
  const engines = client.slice(sectionAt("engines") - 400, sectionAt("engines") + 60);
  assert.equal(engines.includes(`"data-dsh-sep": "above",`), false, "the first module must not draw a line above itself");
});

check("the language pool draws one line for the whole module", () => {
  // 语言池里有两个池字段 + 一个「按次计费参与池」字段。线只在模块开头一次，
  // 否则语言池会被劈成两半。
  const pools = client.slice(client.indexOf("t.poolPolicyLabel") - 600, client.indexOf("renderPoolField(\"en\""));
  assert.equal((pools.match(MARKER) ?? []).length, 1, "the pools module must draw exactly one line");
});

check("fallback triggers close the fallback module, not the pools module", () => {
  // 「回退触发条件」管的是失败类别能不能换引擎，跟语言池无关。它必须落在
  // 回退分区的第一条线之后、语言池分区那条线之前，否则视觉上会被算进语言池。
  const fallbackSection = client.indexOf(`"data-dsh-section": "fallback"`);
  const triggers = client.indexOf("t.fallbackOnHint");
  const poolsSep = client.lastIndexOf(`"data-dsh-sep": "above",`, client.indexOf("t.poolPolicyLabel"));
  assert.ok(fallbackSection > 0, "fallback section missing");
  assert.ok(triggers > 0, "fallback trigger checkbox group missing");
  assert.ok(poolsSep > 0, "pools module separator missing");
  assert.ok(
    fallbackSection < triggers && triggers < poolsSep,
    "fallback triggers must sit inside the fallback module (after its section marker, before the pools separator)",
  );
  // 也不该再插在语言池字段后面。
  const firstPool = client.indexOf(`renderPoolField("zh"`);
  assert.ok(triggers < firstPool, "fallback triggers must not follow the language pool fields");
});

console.log(`OK: ${checks} section separator checks passed`);
