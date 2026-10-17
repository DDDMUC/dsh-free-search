// Local-only test harness (git-ignored): lets the repo's assertion and live
// check scripts run without installing its optional peer dependencies.
//
// Any bare specifier that fails the normal walk-up resolution is retried with
// parentURL anchored inside a DSH install tree, which is where packages like
// @deepseek-ai/dsh-settings / dsh-tools actually live when the plugin runs
// inside DSH Desktop.
//
//   node --import ./_hooks.mjs tools/assert-engines.mjs
//
// The anchor is auto-detected so the file is not tied to one machine; override
// it with DSH_APP_NODE_MODULES=<...>\resources\app\node_modules if needed.
// Not part of the published package.
import { register } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function locateAppNodeModules() {
  if (process.env.DSH_APP_NODE_MODULES) return process.env.DSH_APP_NODE_MODULES;
  const candidates = [];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.push(join(localAppData, "Programs", "DSH Desktop", "resources", "app", "node_modules"));
    candidates.push(join(localAppData, "Programs", "dsh", "resources", "app", "node_modules"));
  }
  // A profile-local install (node_modules/dsh-free-search) can also reach the
  // host tree through the profile anchor, so accept that layout too.
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "@deepseek-ai"))) return candidate;
  }
  return candidates[0];
}

const APP_NODE_MODULES = locateAppNodeModules();
if (!APP_NODE_MODULES || !existsSync(join(APP_NODE_MODULES, "@deepseek-ai"))) {
  throw new Error(
    "cannot locate the DSH app node_modules; set DSH_APP_NODE_MODULES to <DSH install>\\resources\\app\\node_modules"
  );
}
const ANCHOR = pathToFileURL(join(APP_NODE_MODULES, "__anchor.js")).href;

const HOOKS = `
const ANCHOR = ${JSON.stringify(ANCHOR)};
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      specifier.startsWith("node:") ||
      specifier.startsWith("file:") ||
      specifier.startsWith("./") ||
      specifier.startsWith("../") ||
      specifier.startsWith("data:")
    ) {
      throw error;
    }
    return nextResolve(specifier, { ...context, parentURL: ANCHOR });
  }
}
`;

register("data:text/javascript," + encodeURIComponent(HOOKS), import.meta.url);
