import { isAbsolute, resolve } from "node:path";

import type { InstallerLayout, InstallerLayoutConfig } from "./types.js";

const applicationSupportDirectory = [
  "Library",
  "Application Support",
  "Agent Daily Achievements",
] as const;

/**
 * Creates the pure, macOS-specific directory layout for a single installer
 * run. The managed root owns runtime and release state; data is kept in a
 * distinct subtree so activation/removal services can preserve it.
 */
export function createInstallerLayout(
  config: InstallerLayoutConfig,
): InstallerLayout {
  const homeDirectory = requireAbsolutePath(
    "home directory",
    config.homeDirectory,
  );
  const managedRoot = resolve(homeDirectory, ...applicationSupportDirectory);
  const sourceInstallPath = requireAbsolutePath(
    "source-install path",
    config.sourceInstallPath,
  );
  if (pathsOverlap(sourceInstallPath, managedRoot)) {
    throw new Error("source-install path must not overlap the managed root");
  }
  const stagingRoot = resolve(managedRoot, "staging");
  const userDataRoot = resolve(managedRoot, "data");

  return {
    managedRoot,
    sourceInstallPath,
    runtimePath: (version) =>
      versionedPath(managedRoot, "runtimes", "node", version),
    runtimeStagingPath: (version) =>
      versionedPath(stagingRoot, undefined, "node", version),
    releasePath: (version) =>
      versionedPath(managedRoot, "releases", "app", version),
    releaseStagingPath: (version) =>
      versionedPath(stagingRoot, undefined, "app", version),
    activeReleasePath: resolve(managedRoot, "active-release"),
    userDataRoot,
    reportsPath: resolve(userDataRoot, "reports"),
    settingsPath: resolve(userDataRoot, "settings.json"),
    summaryPermissionPath: resolve(userDataRoot, "summary-permission.json"),
  };
}

function requireAbsolutePath(label: string, value: string | undefined): string {
  if (!value) throw new Error(`${label} must be supplied explicitly`);
  if (!isAbsolute(value)) throw new Error(`${label} must be absolute`);
  if (resolve(value) !== value)
    throw new Error(`${label} must not escape its path`);
  return value;
}

function versionedPath(
  root: string,
  directory: string | undefined,
  prefix: string,
  version: string,
): string {
  if (
    !version ||
    version === "." ||
    version === ".." ||
    /[\\/]/.test(version)
  ) {
    throw new Error("version must not escape its path");
  }
  return directory
    ? resolve(root, directory, `${prefix}-v${version}`)
    : resolve(root, `${prefix}-v${version}`);
}

function pathsOverlap(first: string, second: string): boolean {
  return (
    first === second ||
    first.startsWith(`${second}/`) ||
    second.startsWith(`${first}/`)
  );
}
