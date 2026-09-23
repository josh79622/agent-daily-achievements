import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

await rm("dist", { force: true, recursive: true });

const compiler = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc"],
  {
    stdio: "inherit",
  },
);

if (compiler.status !== 0) {
  process.exit(compiler.status ?? 1);
}

// The web/ React app has its own build (vite.config.ts), separate from the
// server's tsc compile above; it writes into dist/web, which
// src/server/app.ts serves as static files.
const webBuild = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build"],
  { stdio: "inherit" },
);

if (webBuild.status !== 0) {
  process.exit(webBuild.status ?? 1);
}

if (process.platform === "darwin") {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const notificationModulePath = resolve(
    repositoryRoot,
    "dist/src/schedule/notification.js",
  );
  /** @type {{ ensureNotifierApplet: typeof import("../src/schedule/notification.js").ensureNotifierApplet }} */
  const { ensureNotifierApplet } = await import(
    pathToFileURL(notificationModulePath).href
  );
  const appletBinary = await ensureNotifierApplet({ repositoryRoot });
  if (!appletBinary) {
    console.error("Warning: Failed to pre-compile DailyProofNotifier.app");
  } else {
    console.log("Pre-compiled DailyProofNotifier.app successfully.");
  }
}
