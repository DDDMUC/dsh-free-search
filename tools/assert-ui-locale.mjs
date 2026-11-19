// Render the shipped client, not a duplicate locale resolver. All bridge I/O is offline.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
const clientPath = pkg.exports["./client"];
const source = process.argv.includes("--baseline")
  ? execFileSync("git", ["show", `HEAD:${clientPath.replace(/^\.\//, "")}`], { cwd: fileURLToPath(root), encoding: "utf8" })
  : fs.readFileSync(new URL(clientPath, root), "utf8");
let checks = 0;
async function check(name, fn) {
  await fn();
  console.log(`  ok  ${name}`);
  checks++;
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (node) => {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  return text(node.children);
};

function fixture({ active = "en", browser = "zh-CN", value = {}, locale = true, eventOnly = false, unavailable = false, deferDescribe = false } = {}) {
  const config = { provider: "bing", lang: "zh", bingMarket: "zh-CN", promptLanguage: "zh", promptToolsLang: "zh", ...value };
  const cleanups = [];
  const localeCleanups = [];
  const hostListeners = new Set();
  const windowListeners = new Set();
  const eventListeners = new Set();
  const registrations = [];
  const commands = [];
  const requests = [];
  const mutations = [];
  const pending = [];
  let localeInjection;
  let snapshot = Object.freeze({ active, locales: [], revision: 0 });
  const face = {
    getLocale: () => snapshot,
    ...(eventOnly ? {} : {
      getSnapshot: () => snapshot,
      subscribe(fn) { hostListeners.add(fn); return () => hostListeners.delete(fn); },
    }),
    setLocale() { assert.fail("the plugin must never set the host locale"); },
  };
  let mounted = false;
  const bind = (list, fn) => { const dispose = fn(); if (typeof dispose === "function") list.push(dispose); };
  const scope = {
    get: (key) => key === "locale" ? face : key === "commandUi" ? command : undefined,
    on(name, fn) {
      assert.equal(name, "locale/change");
      eventListeners.add(fn);
      return () => eventListeners.delete(fn);
    },
    effect(fn) { bind(localeCleanups, fn); },
  };
  const command = {
    register(contribution) {
      const entry = { ...contribution, disposed: false };
      commands.push(entry);
      return () => { assert.equal(entry.disposed, false); entry.disposed = true; };
    },
  };
  const ctx = {
    get: scope.get,
    effect(fn) { bind(cleanups, fn); },
    inject(keys, fn) {
      if (keys.includes("locale")) {
        localeInjection = fn;
        if (locale) { mounted = true; fn(scope); }
      } else fn({ ...scope, effect: ctx.effect });
    },
    slots: {
      inject(name, fn) { bind(cleanups, fn); },
      register(meta, component) {
        const entry = { meta, component, disposed: false };
        registrations.push(entry);
        return () => { assert.equal(entry.disposed, false); entry.disposed = true; };
      },
    },
  };
  const response = (body) => ({ ok: true, json: async () => clone(body) });
  const fetch = async (url, options) => {
    const endpoint = new URL(url, "http://fixture/").pathname.split("/").pop();
    requests.push(endpoint);
    if (endpoint === "describe") {
      const result = unavailable ? { ok: false } : { ok: true, value: { writable: true, namespaces: [{ ns: "web-search-free", value: clone(config) }] } };
      if (deferDescribe) return new Promise((resolve) => pending.push(() => resolve(response(result))));
      return response(result);
    }
    if (endpoint === "credentials-status") return response({ ok: true, value: { configured: {} } });
    if (endpoint === "mutate") {
      const payload = JSON.parse(options.body);
      mutations.push(payload);
      for (const op of payload.ops) {
        assert.equal(op.op, "set");
        assert.equal(op.path.length, 1);
        config[op.path[0]] = op.value;
      }
      return response({ ok: true, value: { value: config } });
    }
    assert.fail(`unexpected network request: ${url}`);
  };
  const window = {
    location: { hash: "" }, innerHeight: 800, scrollY: 0,
    addEventListener(name, fn) { windowListeners.add(fn); },
    removeEventListener(name, fn) { windowListeners.delete(fn); },
    __ModuleLoader__: { load({ factory }) {
      const exports = factory((id) => id === "react-dom" ? { createPortal: (child) => child } : require(id));
      exports.apply(ctx);
    } },
  };
  vm.runInNewContext(source, {
    window, navigator: { language: browser, languages: browser ? [browser] : [] },
    document: {
      baseURI: "http://fixture/", body: {}, documentElement: { scrollHeight: 0 },
      querySelector: (selector) => selector.startsWith("style[") ? {} : null,
      getElementById: () => null,
    },
    fetch, URL, AbortSignal, setTimeout, console,
  }, { filename: "lib/client.js" });
  return {
    config, requests, mutations, pending, registrations, commands, hostListeners, eventListeners, windowListeners,
    slot(name) { return registrations.findLast((r) => !r.disposed && r.meta.name === name); },
    command(name) { return commands.findLast((r) => !r.disposed && r.name === name); },
    switchLocale(next) {
      snapshot = Object.freeze({ active: next, locales: [], revision: snapshot.revision + 1 });
      for (const fn of hostListeners) fn();
      for (const fn of eventListeners) fn(snapshot);
    },
    mountLocale() { assert.equal(mounted, false); mounted = true; localeInjection(scope); },
    unmountLocale() { for (const fn of localeCleanups.splice(0).reverse()) fn(); mounted = false; },
    dispose() {
      for (const fn of cleanups.splice(0).reverse()) fn();
      for (const fn of localeCleanups.splice(0).reverse()) fn();
    },
  };
}

async function render(f) {
  let card, summary;
  await act(async () => {
    card = TestRenderer.create(React.createElement(f.slot("plugins.bundle.config").component));
    summary = TestRenderer.create(React.createElement(f.slot("plugins.row.config").component, { view: "summary" }));
  });
  return { card, summary, async close() { await act(async () => { card.unmount(); summary.unmount(); f.dispose(); }); } };
}
const selectLanguage = (card) => card.root.findAllByType("select").find((node) => node.props["aria-label"] === "Interface language" || node.props["aria-label"] === "界面语言");
const saveButton = (card) => card.root.findByProps({ className: "dshfs-btn dshfs-save" });
const cardText = (r) => text(r.toJSON());
const sidebarLabel = (f) => f.slot("sidebar.panellist").meta.label();

await check("loading and mounted surfaces follow host locale, not browser/search language", async () => {
  const f = fixture({ deferDescribe: true });
  const r = await render(f);
  assert.equal(cardText(r.card), "Loading settings…");
  await act(async () => f.switchLocale("zh-Hant"));
  assert.equal(cardText(r.card), "加载设置中…");
  await act(async () => { for (const resolve of f.pending.splice(0)) resolve(); });
  assert.match(cardText(r.card), /界面语言/);
  assert.equal(sidebarLabel(f), "免费搜索");
  assert.equal(f.command("free-search").description(), "打开免费搜索");
  const before = clone(f.config);
  const count = f.requests.length;
  const cardInstance = r.card.root.findByType(f.slot("plugins.bundle.config").component);
  await act(async () => f.switchLocale("en-GB"));
  assert.equal(r.card.root.findByType(f.slot("plugins.bundle.config").component), cardInstance);
  assert.match(cardText(r.card), /Interface language/);
  assert.match(cardText(r.summary), /Free web search/);
  assert.equal(sidebarLabel(f), "Free Search");
  assert.equal(f.command("free-search-engine").description(), "Switch web search engine");
  assert.equal(f.requests.length, count, "locale changes must not reload settings or call search");
  assert.deepEqual(f.config, before);
  assert.equal(f.mutations.length, 0);
  assert.equal(saveButton(r.card).props.disabled, true, "host switch must not dirty the form");
  await r.close();
  assert.equal(f.hostListeners.size, 0);
  assert.equal(f.windowListeners.size, 0);
  assert.ok(f.registrations.every((r) => r.disposed));
  assert.ok(f.commands.every((r) => r.disposed));
});

for (const uiLang of [undefined, "", "auto", " AUTO "]) {
  await check(`automatic preference ${JSON.stringify(uiLang)} follows live host switches`, async () => {
    const f = fixture({ value: { uiLang } });
    const r = await render(f);
    assert.match(cardText(r.card), /Interface language/);
    await act(async () => f.switchLocale("zh-CN"));
    assert.match(cardText(r.card), /界面语言/);
    assert.equal(sidebarLabel(f), "免费搜索");
    await act(async () => f.switchLocale("fr-FR"));
    assert.match(cardText(r.card), /Interface language/);
    assert.equal(sidebarLabel(f), "Recherche gratuite");
    assert.equal(f.mutations.length, 0);
    await r.close();
  });
}

for (const uiLang of ["en", "zh", "EN-us", "zh_TW"]) {
  await check(`explicit ${uiLang} survives host changes without writing settings`, async () => {
    const f = fixture({ value: { uiLang }, active: "fr" });
    const r = await render(f);
    const expected = uiLang.toLowerCase().startsWith("zh") ? "界面语言" : "Interface language";
    assert.ok(cardText(r.card).includes(expected));
    const oldText = cardText(r.card);
    await act(async () => f.switchLocale("zh"));
    await act(async () => f.switchLocale("en"));
    assert.equal(cardText(r.card), oldText);
    assert.equal(f.config.uiLang, uiLang);
    assert.equal(f.mutations.length, 0);
    await r.close();
  });
}

await check("draft language, discard and save preserve search/provider/prompt settings", async () => {
  const f = fixture({ value: { uiLang: "auto", provider: "multi", lang: "ru", promptLanguage: "zh", bingMarket: "ja-JP" } });
  const r = await render(f);
  await act(async () => selectLanguage(r.card).props.onChange({ target: { value: "zh" } }));
  assert.match(cardText(r.card), /界面语言/);
  assert.equal(sidebarLabel(f), "Free Search", "draft is local to the settings card");
  assert.equal(f.config.uiLang, "auto");
  await act(async () => f.switchLocale("fr"));
  assert.match(cardText(r.card), /界面语言/);
  assert.equal(saveButton(r.card).props.disabled, false, "host switch preserves unsaved edits");
  const discard = r.card.root.findAllByType("button").find((node) => node.children.includes("撤销"));
  assert.ok(discard, "discard control is rendered");
  await act(async () => discard.props.onClick());
  assert.match(cardText(r.card), /Interface language/);
  assert.equal(selectLanguage(r.card).props.value, "");
  await act(async () => selectLanguage(r.card).props.onChange({ target: { value: "zh" } }));
  await act(async () => saveButton(r.card).props.onClick());
  assert.equal(f.config.uiLang, "zh");
  assert.equal(sidebarLabel(f), "免费搜索");
  assert.equal(f.command("free-search").description(), "打开免费搜索");
  assert.equal(f.config.provider, "multi");
  assert.equal(f.config.lang, "ru");
  assert.equal(f.config.bingMarket, "ja-JP");
  assert.equal(f.config.promptLanguage, "zh");
  assert.equal(f.config.promptToolsLang, "zh");
  assert.ok(f.mutations.every((m) => m.ops.every((op) => op.path[0] !== "lang")));
  await act(async () => selectLanguage(r.card).props.onChange({ target: { value: "" } }));
  await act(async () => saveButton(r.card).props.onClick());
  await act(async () => f.switchLocale("en"));
  assert.equal(f.config.uiLang, "");
  assert.match(cardText(r.card), /Interface language/);
  await r.close();
});

await check("slash options use UI locale and selecting an engine only writes provider", async () => {
  const f = fixture({ value: { uiLang: "en", lang: "zh" } });
  const r = await render(f);
  const options = await f.command("free-search-engine").ui.options();
  assert.equal(options.find((v) => v.id === "bing").detail, "current");
  assert.match(options.find((v) => v.id === "auto").label, /Smart routing/);
  await f.command("free-search-engine").ui.onSelect({ id: "auto" });
  assert.deepEqual(f.mutations, [{ ns: "web-search-free", ops: [{ op: "set", path: ["provider"], value: "auto" }] }]);
  assert.equal(f.config.lang, "zh");
  await r.close();
});

await check("missing service falls back safely and late injection/disposal stays reactive", async () => {
  const f = fixture({ locale: false, browser: "zh-TW" });
  const r = await render(f);
  assert.match(cardText(r.card), /界面语言/);
  await act(async () => f.mountLocale());
  assert.match(cardText(r.card), /Interface language/);
  assert.equal(f.hostListeners.size, 1);
  await act(async () => f.unmountLocale());
  assert.equal(f.hostListeners.size, 0);
  assert.match(cardText(r.card), /界面语言/);
  await act(async () => f.mountLocale());
  assert.equal(f.hostListeners.size, 1);
  await r.close();
  assert.equal(f.hostListeners.size, 0);
});

await check("getLocale plus locale/change supports older hosts with disposer cleanup", async () => {
  const f = fixture({ eventOnly: true });
  const r = await render(f);
  assert.equal(f.eventListeners.size, 1);
  await act(async () => f.switchLocale("zh"));
  assert.match(cardText(r.card), /界面语言/);
  await r.close();
  assert.equal(f.eventListeners.size, 0);
});

await check("unavailable settings and unknown browser locale default to English", async () => {
  const f = fixture({ locale: false, browser: "", unavailable: true });
  const r = await render(f);
  assert.match(cardText(r.card), /Settings unavailable/);
  assert.match(cardText(r.summary), /Free web search/);
  assert.equal(sidebarLabel(f), "Free Search");
  await r.close();
});

console.log(`OK: ${checks} UI-locale behavior checks passed`);
