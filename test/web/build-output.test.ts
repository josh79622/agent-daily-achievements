import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

// Task 1 of the React + Vite migration (framework decision, 2026-09-18):
// this replaces the old assertions against the vanilla-DOM bundle (which no
// longer exists — constellation, source trace-back, edit/remove, and the
// sign-in/local-activity panels are being rebuilt in React over the next
// tasks, not ported in this one). This only checks that the new build
// pipeline produces a working shell; it is not a claim that those features
// are back yet.
test("the Vite build produces a working React shell", async () => {
  const build = spawnSync(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "build"],
    {
      encoding: "utf8",
    },
  );

  expect(build.status, build.stderr).toBe(0);
  const html = await readFile("dist/web/index.html", "utf8");

  expect(html).toMatch(/<div id="root">/);
  const scriptMatch = html.match(/<script[^>]*src="(\/assets\/[^"]+\.js)"/);
  expect(scriptMatch, html).not.toBeNull();
  const scriptPath = `dist/web${scriptMatch![1]}`;
  const script = await readFile(scriptPath, "utf8");

  expect(script).toMatch(/Daily Proof/);
  expect(script).toMatch(/React \+ Vite scaffold/);
  // The old vanilla entry point is gone; nothing should still reference it.
  expect(html).not.toMatch(/app\.js/);
});
