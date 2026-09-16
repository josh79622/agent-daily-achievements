import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("builds the fictional-data notice and sample-report control", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });

  assert.equal(build.status, 0, build.stderr);
  const html = await readFile("dist/web/index.html", "utf8");
  assert.match(html, /Daily Proof\./);
  assert.match(html, /localhost:4317/);
  assert.match(html, /Integration status/);
  assert.match(html, /Awaiting generation/);
  assert.match(html, /Fictional preview/);
  assert.match(html, /Generate sample report/);
  assert.match(html, /id="report-view"/);
});
