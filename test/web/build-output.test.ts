import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("builds the minimal daily-report workflow", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });

  assert.equal(build.status, 0, build.stderr);
  const html = await readFile("dist/web/index.html", "utf8");
  const css = await readFile("dist/web/styles.css", "utf8");
  assert.match(html, /type="date"/);
  assert.match(html, /Fictional preview/);
  assert.match(html, /Generate sample report/);
  assert.match(html, /id="report-view"/);
  assert.doesNotMatch(html, /Today’s proof/);
  assert.doesNotMatch(html, /Collected gently in the background/);
  assert.match(css, /\.empty-state\[hidden\]/);
});
