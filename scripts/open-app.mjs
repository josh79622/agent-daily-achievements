// Checks if the Daily Proof web server is running on port 4317.
// If stopped, auto-wakes the server in the background and opens the browser.
// If already running, directly opens the browser.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dirname, "..");
const distScriptPath = resolve(repositoryRoot, "dist/src/server/index.js");
const distLauncherPath = resolve(repositoryRoot, "dist/src/server/launcher.js");

if (!existsSync(distScriptPath) || !existsSync(distLauncherPath)) {
  console.error(
    `Production build not found.\nPlease run "npm run build" first.`,
  );
  process.exit(1);
}

/** @type {{ ensureServerAndOpen: typeof import("../src/server/launcher.js").ensureServerAndOpen }} */
const { ensureServerAndOpen } = await import(
  pathToFileURL(distLauncherPath).href
);

const result = await ensureServerAndOpen({
  port: 4317,
  scriptPath: distScriptPath,
  cwd: repositoryRoot,
  url: "http://127.0.0.1:4317/",
});

if (result.serverStarted) {
  console.log(
    "Daily Proof web server started in background at http://127.0.0.1:4317/",
  );
} else {
  console.log("Daily Proof web server is active at http://127.0.0.1:4317/");
}

process.exit(0);
