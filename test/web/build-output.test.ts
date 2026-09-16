import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("builds the calm daily-review page and sample-report control", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });

  assert.equal(build.status, 0, build.stderr);
  const html = await readFile("dist/web/index.html", "utf8");
  assert.match(html, /Good evening/);
  assert.match(html, /Today’s proof/);
  assert.match(html, /Private by design/);
  assert.match(html, /Fictional preview/);
  assert.match(html, /Generate sample report/);
  assert.match(html, /id="report-view"/);
});
