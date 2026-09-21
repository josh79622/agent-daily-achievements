import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import { writeLaunchdJob } from "../../src/schedule/launchd-install.js";

// Task S1, test case S1-18. Only the file-writing "install" step is
// exercised — never real launchctl (that lives in scripts/install-launchd.mjs,
// which nothing here runs).

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test("S1-18: installing the job twice replaces it in place, not duplicated", async () => {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-launchd-"));
  directories.push(root);
  const plistPath = join(
    root,
    "LaunchAgents",
    "com.dailyproof.scheduled-report.plist",
  );

  const first = await writeLaunchdJob({ plistPath, content: "first-version" });
  expect(first.replaced).toBe(false);
  expect(await readFile(plistPath, "utf8")).toBe("first-version");

  const second = await writeLaunchdJob({
    plistPath,
    content: "second-version",
  });
  expect(second.replaced).toBe(true);

  // The existing job was replaced, not duplicated: the content is the
  // latest install's, and no second file appeared alongside it.
  expect(await readFile(plistPath, "utf8")).toBe("second-version");
  const entries = await readdir(join(root, "LaunchAgents"));
  expect(entries).toEqual(["com.dailyproof.scheduled-report.plist"]);
});
