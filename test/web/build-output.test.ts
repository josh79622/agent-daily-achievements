import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

test("builds the achievement constellation", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });

  expect(build.status, build.stderr).toBe(0);
  const html = await readFile("dist/web/index.html", "utf8");
  const app = await readFile("dist/web/app.js", "utf8");
  const css = await readFile("dist/web/styles.css", "utf8");
  expect(html).toMatch(/id="constellation"/);
  expect(html).toMatch(/<time/);
  expect(html).toMatch(/id="collector-toggle"/);
  expect(html).toMatch(/id="collector-panel"/);
  expect(html).toMatch(/id="source-consent-form"/);
  expect(html).toMatch(/id="source-claude-code"/);
  expect(html).toMatch(/id="source-codex"/);
  expect(html).not.toMatch(/checked/);
  expect(html).toMatch(/No conversation text leaves this machine/);
  expect(html).toMatch(/separate consent/);
  expect(app).toMatch(/api\/collector\/consent/);
  expect(app).toMatch(/function replaceCollection/);
  expect(app.match(/kind: "achievement"/g) ?? []).toHaveLength(3);
  expect(app).toMatch(/Expand/);
  expect(app).toMatch(/Related/);
  expect(app).toMatch(/Preview locally/);
  expect(html).not.toMatch(/Generate sample report/);
  expect(css).toMatch(/\.constellation-node/);
});
