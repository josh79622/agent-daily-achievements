// Installs the daily 07:00 report job as a launchd LaunchAgent.
//
// Not run automatically by anything in this repository (not `npm run
// check`, not `npm run build`) — the owner runs it by hand, once they are
// ready to schedule the job on their own Mac:
//
//   npx tsx scripts/install-launchd.mjs
//
// It writes the generated .plist to the same fixed path every time
// (src/schedule/launchd-install.js keeps installing idempotent: a second
// run replaces the job rather than duplicating it, S1-18), then asks
// launchctl to reload it.

import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  buildLaunchdPlist,
  defaultLaunchdJobLabel,
} from "../src/schedule/launchd-plist.js";
import {
  defaultLaunchdPlistPath,
  writeLaunchdJob,
} from "../src/schedule/launchd-install.js";

// The shell's default Node fails to start on this machine (AGENTS.md /
// PROGRESS.md); the job must reference the approved runtime by absolute
// path rather than rely on launchd inheriting a shell PATH.
const nodePath = "/opt/homebrew/opt/node@24/bin/node";
const repositoryRoot = resolve(import.meta.dirname, "..");
const scriptPath = resolve(repositoryRoot, "dist/src/schedule/entry.js");
const plistPath = defaultLaunchdPlistPath();

const content = buildLaunchdPlist({
  nodePath,
  scriptPath,
  workingDirectory: repositoryRoot,
  standardOutPath: resolve(repositoryRoot, "data/logs/scheduled-report.log"),
  standardErrorPath: resolve(repositoryRoot, "data/logs/scheduled-report.log"),
});

const { replaced } = await writeLaunchdJob({ plistPath, content });

const uid = process.getuid?.() ?? 0;
const target = `gui/${uid}/${defaultLaunchdJobLabel}`;
// Unloading a job that was never loaded exits non-zero; that is fine here.
spawnSync("launchctl", ["bootout", `gui/${uid}`, plistPath], {
  stdio: "ignore",
});
const bootstrap = spawnSync(
  "launchctl",
  ["bootstrap", `gui/${uid}`, plistPath],
  {
    stdio: "inherit",
  },
);

if (bootstrap.status !== 0) {
  console.error(`launchctl bootstrap failed for ${target}.`);
  process.exit(bootstrap.status ?? 1);
}

console.log(
  `${replaced ? "Replaced" : "Installed"} the launchd job at ${plistPath}, running ${scriptPath} daily at 07:00.`,
);
