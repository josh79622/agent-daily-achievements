// Installs the Daily Proof web server as a macOS launchd LaunchAgent.
// Keeps the server alive across system reboots and auto-revives it if killed.

import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import {
  buildWebServerLaunchdPlist,
  defaultWebServerJobLabel,
  defaultWebServerPlistPath,
} from "../src/server/web-launchd-plist.js";

/**
 * @param {{ nodePath: string, repositoryRoot: string, plistPath: string, uid: number, label?: string }} configuration
 * @param {{
 *   launchctl: (arguments_: string[]) => { status: number | null },
 *   writePlist: (path: string, content: string) => Promise<void>,
 *   report: (message: string) => void,
 * }} adapter
 */
export async function installWebServerJob(configuration, adapter) {
  if (!configuration.nodePath.startsWith("/")) {
    throw new Error("managed Node path must be absolute");
  }

  const label = configuration.label ?? defaultWebServerJobLabel;
  const scriptPath = resolve(
    configuration.repositoryRoot,
    "dist/src/server/index.js",
  );
  const content = buildWebServerLaunchdPlist({
    label,
    nodePath: configuration.nodePath,
    scriptPath,
    workingDirectory: configuration.repositoryRoot,
    standardOutPath: resolve(
      configuration.repositoryRoot,
      "data/logs/web-server.log",
    ),
    standardErrorPath: resolve(
      configuration.repositoryRoot,
      "data/logs/web-server.log",
    ),
  });

  await adapter.writePlist(configuration.plistPath, content);

  const domain = `gui/${configuration.uid}`;
  const target = `${domain}/${label}`;

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
    `Installed the web server launchd job at ${configuration.plistPath}, keeping ${scriptPath} running.`,
  );
  return { status: "ready" };
}

async function main() {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const uid = process.getuid?.() ?? 0;
  const nodePath =
    process.env.AGENT_DAILY_ACHIEVEMENTS_MANAGED_NODE_PATH ?? process.execPath;

  if (!isAbsolute(nodePath)) {
    throw new Error("managed Node path must be absolute");
  }

  const plistPath = defaultWebServerPlistPath();
  const result = await installWebServerJob(
    {
      nodePath,
      repositoryRoot,
      plistPath,
      uid,
    },
    {
      launchctl: (arguments_) =>
        spawnSync("launchctl", arguments_, { stdio: "inherit" }),
      writePlist: async (path, content) => {
        await mkdir(resolve(path, ".."), { recursive: true });
        await writeFile(path, content, "utf8");
      },
      report: (message) => console.log(message),
    },
  );

  if (result.status === "failed") {
    process.exitCode = result.exitCode;
  }
}

if (
  import.meta.main ||
  (process.argv[1] &&
    resolve(process.argv[1]) === resolve(import.meta.filename ?? ""))
) {
  await main();
}
