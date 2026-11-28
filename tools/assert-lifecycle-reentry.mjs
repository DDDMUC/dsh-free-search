// #173：三条 Cordis 生命周期规则的回归断言。
//
// 这三条都是「重跑 apply」相关，只在服务重启时才暴露，普通单测抓不到。
// 这里直接读源码结构，把修法钉死：
//   1. 重入保护必须随 ctx.effect 撤销
//   2. 桥路由不能走 registerOnce（撞名会静默复用别人的路由）
//   3. 嵌套 inject 挂在 sctx 上，不挂插件根
import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
};

const guardBlock = () => {
  const at = index.indexOf("appliedContexts.add(ctx)");
  assert.ok(at > 0, "the re-entry guard is missing");
  return index.slice(at, at + 400);
};

check("the re-entry guard is released when the effect is disposed", () => {
  // Cordis 在注入的服务重新提供时，会撤销本 fiber 的全部效应，然后在同一个 ctx
  // 上再调 apply。只加不减会把正常重跑当成异常重入挡掉 —— 插件只剩空 fiber。
  const block = guardBlock();
  assert.match(block, /ctx\.effect\(/, "the guard must register an effect");
  assert.match(block, /appliedContexts\.delete\(ctx\)/, "the effect must delete the ctx on dispose");
});

check("bridge routes are registered directly, not through registerOnce", () => {
  // registerOnce 撞名时返回空 disposer。对 provider 撞的是自己上一轮，可以接受；
  // 但 webServer 路由撞名时，占着路径的可能是别的插件 —— 请求会被它的处理器应答，
  // 本插件毫无察觉。
  assert.match(index, /\)\.map\(\(route\) => sctx\.get\("webServer"\)\.register\(route\)\)/,
    "bridge routes must call webServer.register directly");
  assert.equal(/registerOnce\(\(\) => sctx\.get\("webServer"\)\.register/.test(index), false,
    "bridge routes must not be wrapped in registerOnce");
});

check("the nested auth inject hangs off the settings context", () => {
  // 用外层 ctx 会把子 fiber 挂到插件根上：web / settings 每重提供一次就多挂一个，
  // 旧的随 sctx 撤不掉，一路累积到卸载。
  assert.match(index, /sctx\.inject/, "the nested inject must use sctx");
  const at = index.indexOf('["connection.authentication"]');
  assert.ok(at > 0, "the auth inject is missing");
  const around = index.slice(Math.max(0, at - 400), at);
  assert.equal(/^\s*ctx\.inject\(\[$/m.test(around.trim().split("\n").pop() ?? ""), false,
    "the auth inject must not be called on the outer ctx");
});

console.log(`OK: ${checks} lifecycle checks passed`);
