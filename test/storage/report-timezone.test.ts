import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import { readReportTimeZone } from "../../src/storage/report-timezone.js";

// Supporting infrastructure for S1-16 (the schedule must not invent a
// timezone when the stored one is unreadable). Not itself an S1 test case;
// covers readReportTimeZone's own read paths.

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function withFile(contents: string | undefined): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-report-timezone-"));
  directories.push(root);
  const path = join(root, "report-timezone.json");
  if (contents !== undefined) await writeFile(path, contents, "utf8");
  return path;
}

test("returns ok:false when no path is configured", async () => {
  expect(await readReportTimeZone(undefined)).toEqual({ ok: false });
});

test("returns ok:false when the file does not exist", async () => {
  const path = await withFile(undefined);
  expect(await readReportTimeZone(path)).toEqual({ ok: false });
});

test("returns ok:false for malformed JSON", async () => {
  const path = await withFile("{not json");
  expect(await readReportTimeZone(path)).toEqual({ ok: false });
});

test("returns ok:false for an invalid IANA timezone name", async () => {
  const path = await withFile(JSON.stringify({ timeZone: "Not/A-Timezone" }));
  expect(await readReportTimeZone(path)).toEqual({ ok: false });
});

test("returns the stored timezone when it is valid", async () => {
  const path = await withFile(JSON.stringify({ timeZone: "Asia/Taipei" }));
  expect(await readReportTimeZone(path)).toEqual({
    ok: true,
    timeZone: "Asia/Taipei",
  });
});
