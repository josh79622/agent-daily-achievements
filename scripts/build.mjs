import { cp, mkdir, readdir, rm } from "node:fs/promises";
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

const webFiles = await readdir("web").catch(() => []);
const staticFiles = webFiles.filter((file) => !file.endsWith(".ts"));

if (staticFiles.length > 0) {
  await mkdir("dist/web", { recursive: true });
  await Promise.all(
    staticFiles.map((file) =>
      cp(`web/${file}`, `dist/web/${file}`, { recursive: true }),
    ),
  );
}
