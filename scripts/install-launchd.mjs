// Installs the daily 07:00 report job as a launchd LaunchAgent. The
// installer supplies the managed absolute Node path; this script never falls
// back to a developer's shell PATH or Homebrew runtime.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  buildLaunchdPlist,
  defaultLaunchdJobLabel,
} from "../src/schedule/launchd-plist.js";
import {
  defaultLaunchdPlistPath,
  writeLaunchdJob as writeLaunchdJobToDisk,
} from "../src/schedule/launchd-install.js";

/**
 * @typedef {{ status: number | null }} LaunchctlResult
 * @typedef {{ nodePath: string, repositoryRoot: string, plistPath: string, uid: number, label?: string }} LaunchdJobConfiguration
 * @typedef {{
 *   launchctl: (arguments_: string[]) => LaunchctlResult,
 *   writeLaunchdJob: (request: { plistPath: string, content: string }) => Promise<{ replaced: boolean }>,
 *   report: (message: string) => void,
 * }} LaunchdJobAdapter
 */

/**
 * Writes and reloads exactly one launchd job through injected platform
 * operations. Keeping the process adapter outside the plist builder lets
 * unit tests verify reload behavior without invoking launchctl.
 *
 * @param {LaunchdJobConfiguration} configuration
 * @param {LaunchdJobAdapter} adapter
 * @returns {Promise<{ status: "ready", replaced: boolean } | { status: "failed", exitCode: number }>}
 */
export async function installLaunchdJob(configuration, adapter) {
  if (!configuration.nodePath.startsWith("/")) {
    throw new Error("managed Node path must be absolute");
  }

  const label = configuration.label ?? defaultLaunchdJobLabel;
  const scriptPath = resolve(
    configuration.repositoryRoot,
    "dist/src/schedule/entry.js",
  );
  const content = buildLaunchdPlist({
    label,
    nodePath: configuration.nodePath,
    scriptPath,
    workingDirectory: configuration.repositoryRoot,
    standardOutPath: resolve(
      configuration.repositoryRoot,
      "data/logs/scheduled-report.log",
    ),
    standardErrorPath: resolve(
      configuration.repositoryRoot,
      "data/logs/scheduled-report.log",
    ),
  });
  const { replaced } = await adapter.writeLaunchdJob({
    plistPath: configuration.plistPath,
    content,
  });

  const domain = `gui/${configuration.uid}`;
  const target = `${domain}/${label}`;
  // A job that has never been loaded exits non-zero. Its fixed plist path
  // ensures that a re-install replaces the same job rather than adding one.
  adapter.launchctl(["bootout", domain, configuration.plistPath]);
  const bootstrap = adapter.launchctl([
    "bootstrap",
    domain,
    configuration.plistPath,
  ]);
  if (bootstrap.status !== 0) {
    const exitCode = bootstrap.status ?? 1;
    adapter.report(`launchctl bootstrap failed for ${target}.`);
    return { status: "failed", exitCode };
  }

  adapter.report(
    `${replaced ? "Replaced" : "Installed"} the launchd job at ${configuration.plistPath}, running ${scriptPath} daily at 07:00.`,
  );
  return { status: "ready", replaced };
}

function managedNodePathFromInstallerConfiguration() {
  const nodePath = process.env.AGENT_DAILY_ACHIEVEMENTS_MANAGED_NODE_PATH;
  if (!nodePath?.startsWith("/")) {
    throw new Error(
      "AGENT_DAILY_ACHIEVEMENTS_MANAGED_NODE_PATH must contain the installer-managed absolute Node path.",
    );
  }
  return nodePath;
}

async function main() {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const uid = process.getuid?.() ?? 0;
  const result = await installLaunchdJob(
    {
      nodePath: managedNodePathFromInstallerConfiguration(),
      repositoryRoot,
      plistPath: defaultLaunchdPlistPath(),
      uid,
    },
    {
      launchctl: (arguments_) =>
        spawnSync("launchctl", arguments_, { stdio: "inherit" }),
      writeLaunchdJob: writeLaunchdJobToDisk,
      report: (message) => console.log(message),
    },
  );
  if (result.status === "failed") process.exitCode = result.exitCode;
}

if (import.meta.main) {
  await main();
}
