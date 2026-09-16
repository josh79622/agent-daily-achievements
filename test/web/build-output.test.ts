import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("builds the achievement constellation", async () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });

  assert.equal(build.status, 0, build.stderr);
  const html = await readFile("dist/web/index.html", "utf8");
  const app = await readFile("dist/web/app.js", "utf8");
  const css = await readFile("dist/web/styles.css", "utf8");
  assert.match(html, /id="constellation"/);
  assert.match(html, /<time/);
  assert.match(app, /achievement-node/);
  assert.match(app, /Expand/);
  assert.match(app, /Related/);
  assert.doesNotMatch(html, /Generate sample report/);
  assert.match(css, /\.constellation-node/);
});
