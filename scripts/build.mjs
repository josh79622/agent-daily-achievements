import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

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
