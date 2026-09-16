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
  assert.match(html, /Fictional sample · local only/);
  assert.match(html, /Generate sample report/);
  assert.match(html, /id="report-view"/);
  assert.doesNotMatch(html, /What moved today\?/);
  assert.doesNotMatch(html, /This demo uses invented records/);
  assert.doesNotMatch(html, /No report yet/);
  assert.doesNotMatch(html, /Stage 2 · Fictional data only/);
  assert.match(css, /\.empty-state\[hidden\]/);
});
