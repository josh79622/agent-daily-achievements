import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

// React + Vite migration (framework decision, 2026-09-18): this replaces the
// old assertions against the vanilla-DOM bundle, which no longer exists.
// Real component-level tests are their own task (Task 5); until then this
// only checks that each migration task's build still produces a working
// page, updated task by task as web/App.tsx changes.
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

  // Task 2: the constellation fetches the real report instead of showing
  // fixed scaffold text.
  expect(script).toMatch(/Daily Proof/);
  expect(script).toMatch(/api\/reports\/latest/);
  expect(script).toMatch(/No report has been generated yet\./);
  // The old vanilla entry point is gone; nothing should still reference it.
  expect(html).not.toMatch(/app\.js/);
});
