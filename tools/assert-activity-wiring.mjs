// #144 regression: the activity panel must actually register on a live host.
//
// It is gated twice - `sidebarRightTabs` must exist (0.2.2-rc.1+) and the
// `activityPanel` config must be true. If either check silently never runs,
// the panel just never appears and nothing reports why.
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("..", import.meta.url);
const client = fs.readFileSync(new URL("lib/client.js", root), "utf8").replace(/\r\n/g, "\n");
const index = fs.readFileSync(new URL("lib/index.js", root), "utf8");

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("the config key is declared and defaults on", () => {
  assert.match(index, /activityPanel: z\.boolean\(\)\.default\(true\)\.volatile\(\)/);
});

check("the settings card round-trips the key", () => {
  assert.match(client, /const \[activityPanel, setActivityPanel\] = react\.useState\(true\)/);
  assert.match(client, /setActivityPanel\(v\.activityPanel !== false\)/);
  assert.match(client, /path: \["activityPanel"\], value: activityPanel !== false/);
  assert.match(client, /activityPanelController\?\.\(v\.activityPanel !== false\)/);
  assert.match(client, /activityPanelController\?\.\(activityPanel !== false\)/);
});

check("the registration is gated on the service, not on a stale flag", () => {
  // `activitySeatReady` must be set inside the inject callback, so mountActivity()
  // can never run before the seat exists.
  const seat = client.slice(client.indexOf('ctx.inject(["sidebarRightTabs"]'), client.indexOf("free-search: activity panel"));
  assert.ok(seat.includes("activitySeatReady = true"), "the seat flag is never set");
  assert.ok(seat.includes("activitySeatReady = false"), "the seat flag is never cleared");
});

check("the panel registers even when it is already enabled at load", () => {
  // The load path calls mountActivity directly; the settings sync path calls the
  // controller. Both must exist, or enabling it in a previous session does nothing.
  assert.match(client, /if \(view\?\.value\?\.activityPanel !== false\) mountActivity\(\)/);
  assert.match(client, /activityPanelController = \(enabled\) => \{/);
});

check("the tab id is shared by the type, the body and the title", () => {
  const bodyKey = client.match(/name: "sidebar\.right\.pane\.tab", key: ACTIVITY_TAB_ID/);
  const titleKey = client.match(/name: "sidebar\.right\.pane\.tab\.title", key: ACTIVITY_TAB_ID/);
  assert.ok(bodyKey, "body key missing");
  assert.ok(titleKey, "title key missing");
  assert.match(client, /id: ACTIVITY_TAB_ID,\n\s+kind: ACTIVITY_TAB_KIND,/);
});

check("the guide entry makes it discoverable under More tools", () => {
  const block = client.slice(client.indexOf("guide: [{"), client.indexOf("free-search: activity tab type"));
  assert.ok(block.includes('commandId: "free-search.activity"'), "guide entry needs a command id");
  assert.ok(block.includes("title: () =>"), "guide title must be a function");
  assert.ok(block.includes("description: () =>"), "guide description must be a function");
});

check("the client declares the right-sidebar service it depends on", () => {
  // Without this the host never injects the service and ctx.inject is a no-op.
  const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
  assert.ok(
    pkg.dsh.client.inject.includes("@deepseek-ai/dsh-client-ui-sidebar-right"),
    "package.json must declare the sidebar-right client dependency"
  );
});

check("the panel never blocks the rest of the plugin when the service is absent", () => {
  const block = client.slice(client.indexOf('ctx.inject(["sidebarRightTabs"]'), client.indexOf('ctx.inject(["commandUi"]'));
  assert.match(block, /catch \{/);
});

console.log(`OK: ${checks} activity wiring checks passed`);
