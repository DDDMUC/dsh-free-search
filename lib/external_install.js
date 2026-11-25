// Installing an optional external engine from the settings page.
//
// The only reason this is its own module: it shells out to pnpm, and that is
// the one thing in this plugin that turns a click into a shell argument. Keeping
// it isolated makes the allowlist check impossible to bypass by accident.
//
// Progress is honestly reported as "stage + packages imported". pnpm's ndjson
// stream has no completion event per package download — `pnpm:fetching-progress`
// only emits `started` — so a percentage would be invented. See
// docs/engine-extension-plan.md §6.3.
import { spawn } from "node:child_process";

/** How long a single install may take before we give up on it. */
export const INSTALL_TIMEOUT_MS = 180_000;

/** Package namespaces that `pnpm add` may be pointed at. */
const ALLOWED_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

const stages = new Map();

/** Is this a package name pnpm will accept (no shell metacharacters, no flags)? */
export function isValidPackageName(name) {
  if (typeof name !== "string") return false;
  // Leading "-" would be read as a flag by pnpm.
  if (name.startsWith("-")) return false;
  return ALLOWED_NAME.test(name);
}

/** Snapshot the client polls; never undefined so the UI cannot spin forever. */
export function installStatus(packageName) {
  return stages.get(packageName) ?? {
    packageName,
    running: false,
    stage: "idle",
    imported: 0,
    message: "",
    ok: null,
  };
}

/** Fold one ndjson line into the state. Returns true when the line was understood. */
export function applyPnpmEvent(state, line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return false;
  }
  const name = event?.name;
  if (name === "pnpm:stage") {
    const stage = String(event.stage ?? "");
    if (stage.startsWith("resolution")) state.stage = "resolution";
    else if (stage.startsWith("importing")) state.stage = "importing";
    else if (stage === "done" || stage === "finished") state.stage = "done";
    return true;
  }
  if (name === "pnpm:progress") {
    // One event per (package, status); a package reaches `resolved` then
    // `imported` (or `found_in_store` when it is already cached).
    const id = String(event.packageId ?? "");
    if (!id) return true;
    state.seen ??= new Set();
    if (event.status === "imported" || event.status === "found_in_store") {
      if (!state.importedIds) state.importedIds = new Set();
      state.importedIds.add(id);
      state.imported = state.importedIds.size;
    }
    state.seen.add(id);
    return true;
  }
  if (name === "pnpm:summary") {
    state.stage = "done";
    return true;
  }
  return false;
}

/**
 * Start `pnpm add <packageName>` inside the profile and stream its progress.
 *
 * Resolves with `{ ok, code?, message?, installed? }`; the same values land in
 * `installStatus()`, so a client that gave up polling still finds the result.
 */
export async function startInstall({ profileDir, packageName, timeoutMs = INSTALL_TIMEOUT_MS }) {
  if (!isValidPackageName(packageName)) {
    return { ok: false, code: "invalid-package-name", message: `"${packageName}" is not a valid package name` };
  }
  const current = stages.get(packageName);
  if (current?.running === true) {
    return { ok: false, code: "already-running", message: `"${packageName}" is already being installed` };
  }
  const state = { packageName, running: true, stage: "resolution", imported: 0, message: "", ok: null };
  stages.set(packageName, state);

  return await new Promise((resolve) => {
    let settled = false;
    let output = "";
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      state.running = false;
      state.ok = result.ok;
      state.message = result.message ?? "";
      if (result.ok) state.stage = "done";
      else if (state.stage !== "done") state.stage = "failed";
      resolve(result);
    };

    let child;
    try {
      // `--reporter=ndjson` is the only reporter that emits machine-readable
      // events; the default one draws an interactive tree we cannot parse.
      child = spawn("pnpm", ["add", packageName, "--reporter=ndjson"], {
        cwd: profileDir,
        shell: false,
        windowsHide: true,
        env: process.env,
      });
    } catch (error) {
      finish({ ok: false, code: "install-failed", message: String(error?.message ?? error) });
      return;
    }

    const timerRef = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ ok: false, code: "install-timeout", message: `install did not finish within ${timeoutMs / 1000}s` });
    }, timeoutMs);
    timer = timerRef;

    const onData = (chunk) => {
      const text = String(chunk);
      output += text;
      for (const line of text.split("\n")) {
        if (line.trim() === "") continue;
        applyPnpmEvent(state, line);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (error) => {
      finish({ ok: false, code: "install-failed", message: String(error?.message ?? error) });
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish({ ok: true, message: `installed ${packageName}`, installed: state.imported });
        return;
      }
      // pnpm 11 refuses packages younger than 24h by default; tell the user
      // plainly instead of surfacing "exit code 1".
      if (/ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION|minimumReleaseAge/i.test(output)) {
        finish({
          ok: false,
          code: "install-blocked",
          message:
            "pnpm refused the package: it was published less than 24 hours ago " +
            "(pnpm 11 defaults minimumReleaseAge to 1440 minutes). Wait out the cooldown, " +
            "or install manually with --config.minimumReleaseAge=0.",
        });
        return;
      }
      finish({
        ok: false,
        code: "install-failed",
        message: trimOutput(output) || `pnpm exited with ${code}`,
      });
    });
  });
}

/** Last few meaningful lines, for the failure message. */
function trimOutput(output) {
  const lines = String(output)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("{"));
  return lines.slice(-3).join(" ").slice(0, 400);
}

/** Forget a package's state (used by tests, and after a successful re-scan). */
export function resetInstallState(packageName) {
  if (packageName === undefined) stages.clear();
  else stages.delete(packageName);
}
