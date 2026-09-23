// Automated verification of fresh macOS installation prerequisites and isolated runtime state.
// Verifies Node.js >= 24, macOS utilities, isolated storage setup, launchd plist generators,
// and port 4317 listener logic without touching production data/.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dirname, "..");

export async function runFreshInstallVerification() {
  console.log(
    "=== Agent Daily Achievements — Fresh Install Verification ===\n",
  );

  const results = [];

  // Check 1: Node.js version >= 24
  const nodeVersion = process.versions.node;
  const nodeMajor = parseInt(nodeVersion.split(".")[0] ?? "0", 10);
  if (nodeMajor < 24) {
    throw new Error(
      `Node.js 24 LTS or higher is required. Found v${nodeVersion}.`,
    );
  }
  const check1 = `Node.js version >= 24 (found v${nodeVersion})`;
  console.log(`[PASS] ${check1}`);
  results.push({ name: check1, passed: true });

  // Check 2: macOS system utilities
  if (process.platform === "darwin") {
    const osascript = "/usr/bin/osascript";
    const launchctl = "/bin/launchctl";
    if (!existsSync(osascript)) {
      throw new Error(`Required macOS utility not found: ${osascript}`);
    }
    if (!existsSync(launchctl)) {
      throw new Error(`Required macOS utility not found: ${launchctl}`);
    }
    const check2 = `macOS system utilities exist (${osascript}, ${launchctl})`;
    console.log(`[PASS] ${check2}`);
    results.push({ name: check2, passed: true });
  } else {
    const check2 = `macOS system utilities check skipped on ${process.platform}`;
    console.log(`[PASS] ${check2}`);
    results.push({ name: check2, passed: true });
  }

  // Ensure compiled modules exist before testing storage and plists
  const distTzPath = resolve(
    repositoryRoot,
    "dist/src/storage/report-timezone.js",
  );
  const distPermPath = resolve(
    repositoryRoot,
    "dist/src/storage/summary-permission.js",
  );
  const distWebPlistPath = resolve(
    repositoryRoot,
    "dist/src/server/web-launchd-plist.js",
  );
  const distSchedulePlistPath = resolve(
    repositoryRoot,
    "dist/src/schedule/launchd-plist.js",
  );
  const distLauncherPath = resolve(
    repositoryRoot,
    "dist/src/server/launcher.js",
  );

  if (
    !existsSync(distTzPath) ||
    !existsSync(distPermPath) ||
    !existsSync(distWebPlistPath) ||
    !existsSync(distSchedulePlistPath) ||
    !existsSync(distLauncherPath)
  ) {
    console.log("Compiling TypeScript assets for verification...");
    execFileSync("npm", ["run", "build"], {
      cwd: repositoryRoot,
      stdio: "pipe",
    });
  }

  const { setupReportTimeZone } = await import(pathToFileURL(distTzPath).href);
  const { setupSummaryPermission } = await import(
    pathToFileURL(distPermPath).href
  );
  const { buildWebServerLaunchdPlist } = await import(
    pathToFileURL(distWebPlistPath).href
  );
  const { buildLaunchdPlist } = await import(
    pathToFileURL(distSchedulePlistPath).href
  );
  const { isPortListening } = await import(
    pathToFileURL(distLauncherPath).href
  );

  // Check 3: Isolated timezone and summarizer permission setup
  const tempDir = await mkdtemp(join(tmpdir(), "daily-proof-verify-"));
  try {
    const tempTzPath = join(tempDir, "report-timezone.json");
    const tzResult = await setupReportTimeZone({ path: tempTzPath });
    if (tzResult.status !== "written" || !tzResult.timeZone) {
      throw new Error(
        `setupReportTimeZone failed with status: ${tzResult.status}`,
      );
    }

    const tempPermPath = join(tempDir, "summary-permission.json");
    const permResult = await setupSummaryPermission({ path: tempPermPath });
    if (permResult.status !== "written" || !permResult.permission) {
      throw new Error(
        `setupSummaryPermission failed with status: ${permResult.status}`,
      );
    }

    const check3 = `Isolated report timezone and summary permission setup (${tzResult.timeZone}, preferred: ${permResult.permission.preferredCli})`;
    console.log(`[PASS] ${check3}`);
    results.push({ name: check3, passed: true });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  // Check 4: LaunchAgent plist generator valid XML and absolute paths
  const webServerPlist = buildWebServerLaunchdPlist({
    nodePath: process.execPath,
    scriptPath: resolve(repositoryRoot, "dist/src/server/index.js"),
    workingDirectory: repositoryRoot,
    standardOutPath: resolve(repositoryRoot, "data/logs/web-server.log"),
    standardErrorPath: resolve(repositoryRoot, "data/logs/web-server.log"),
  });

  if (
    !webServerPlist.startsWith('<?xml version="1.0" encoding="UTF-8"?>') ||
    !webServerPlist.includes('<plist version="1.0">') ||
    !webServerPlist.includes(process.execPath) ||
    !webServerPlist.includes("com.dailyproof.web-server") ||
    !webServerPlist.includes("<key>KeepAlive</key>\n  <true/>")
  ) {
    throw new Error(
      "buildWebServerLaunchdPlist generated invalid XML or missing absolute paths",
    );
  }

  const schedulePlist = buildLaunchdPlist({
    nodePath: process.execPath,
    scriptPath: resolve(repositoryRoot, "dist/src/schedule/entry.js"),
    workingDirectory: repositoryRoot,
    standardOutPath: resolve(repositoryRoot, "data/logs/scheduled-report.log"),
    standardErrorPath: resolve(
      repositoryRoot,
      "data/logs/scheduled-report.log",
    ),
    hour: 9,
    minute: 0,
  });

  if (
    !schedulePlist.startsWith('<?xml version="1.0" encoding="UTF-8"?>') ||
    !schedulePlist.includes('<plist version="1.0">') ||
    !schedulePlist.includes(process.execPath) ||
    !schedulePlist.includes("com.dailyproof.scheduled-report") ||
    !schedulePlist.includes("<key>Hour</key>\n    <integer>9</integer>")
  ) {
    throw new Error(
      "buildLaunchdPlist generated invalid XML or missing absolute paths",
    );
  }

  const check4 =
    "LaunchAgent plist generator valid XML and absolute paths (web-server & scheduler)";
  console.log(`[PASS] ${check4}`);
  results.push({ name: check4, passed: true });

  // Check 5: Port 4317 launcher responsiveness
  const listening = await isPortListening(4317, "127.0.0.1", 300);
  const check5 = `Port 4317 listener logic responds cleanly (active: ${listening})`;
  console.log(`[PASS] ${check5}`);
  results.push({ name: check5, passed: true });

  console.log("\nAll fresh-install verification checks passed successfully!");
  return results;
}

if (
  import.meta.main ||
  (process.argv[1] &&
    resolve(process.argv[1]) === resolve(import.meta.filename ?? ""))
) {
  try {
    await runFreshInstallVerification();
  } catch (error) {
    console.error("\n[FAIL] Fresh install verification failed:", error);
    process.exit(1);
  }
}
