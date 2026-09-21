import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

// Task 5 (docs/plans/2026-09-21-task-5-component-tests-test-cases.md),
// case T5-16. Real behavior is now exercised by rendering the components
// themselves (test/web/LanguageSelector.test.tsx, test/web/DateSelector.test.tsx);
// this only checks that the production build still produces a working page
// shell, without asserting on any string inside the bundle.
test("T5-16: the production build produces an HTML page with a root element and a script", async () => {
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
});
