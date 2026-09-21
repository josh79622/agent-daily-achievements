import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import {
  readReportTimeZone,
  setupReportTimeZone,
} from "../../src/storage/report-timezone.js";

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

// Task S2: `npm run setup` (src/storage/report-timezone.ts,
// setupReportTimeZone). One case per S2-1..S2-10 from
// docs/plans/2026-09-21-task-s2-setup-command-test-cases.md.

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-setup-timezone-"));
  directories.push(root);
  return root;
}

test("S2-1: no stored file and a valid system timezone writes the file", async () => {
  const root = await tempRoot();
  const path = join(root, "report-timezone.json");

  const result = await setupReportTimeZone({
    path,
    systemTimeZone: () => "Asia/Taipei",
  });

  expect(result).toEqual({
    status: "written",
    timeZone: "Asia/Taipei",
    replacedCorrupt: false,
  });
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
    timeZone: "Asia/Taipei",
  });
});

test("S2-2: a stored file is kept, not overwritten", async () => {
  const root = await tempRoot();
  const path = join(root, "report-timezone.json");
  await writeFile(path, JSON.stringify({ timeZone: "Europe/Paris" }), "utf8");

  const result = await setupReportTimeZone({
    path,
    systemTimeZone: () => "Asia/Taipei",
  });

  expect(result).toEqual({ status: "kept", timeZone: "Europe/Paris" });
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
    timeZone: "Europe/Paris",
  });
});

test("S2-3: --force with a stored file replaces it with the explicit zone", async () => {
  const root = await tempRoot();
  const path = join(root, "report-timezone.json");
  await writeFile(path, JSON.stringify({ timeZone: "Europe/Paris" }), "utf8");

  const result = await setupReportTimeZone({
    path,
    force: "Asia/Taipei",
    systemTimeZone: () => "Europe/Paris",
  });

  expect(result).toEqual({
    status: "written",
    timeZone: "Asia/Taipei",
    replacedCorrupt: false,
  });
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
    timeZone: "Asia/Taipei",
  });
});

test("S2-4: no system timezone writes nothing and asks for an explicit zone", async () => {
  const root = await tempRoot();
  const path = join(root, "report-timezone.json");

  const result = await setupReportTimeZone({
    path,
    systemTimeZone: () => undefined,
  });

  expect(result).toEqual({ status: "no-timezone" });
  await expect(readFile(path, "utf8")).rejects.toThrow();
});

test("S2-5: an invalid system timezone writes nothing and asks for an explicit zone", async () => {
  const root = await tempRoot();
  const path = join(root, "report-timezone.json");

  const result = await setupReportTimeZone({
    path,
    systemTimeZone: () => "Not/A-Timezone",
  });

  expect(result).toEqual({ status: "no-timezone" });
  await expect(readFile(path, "utf8")).rejects.toThrow();
});

test("S2-6: an explicit zone that is not a real IANA name writes nothing and names the bad value", async () => {
  const root = await tempRoot();
  const path = join(root, "report-timezone.json");

  const result = await setupReportTimeZone({
    path,
    force: "Not/A-Timezone",
    systemTimeZone: () => "Asia/Taipei",
  });

  expect(result).toEqual({
    status: "invalid-explicit",
    value: "Not/A-Timezone",
  });
  await expect(readFile(path, "utf8")).rejects.toThrow();
});

test("S2-7: the file setup writes is accepted by the schedule's reader", async () => {
  const root = await tempRoot();
  const path = join(root, "report-timezone.json");

  await setupReportTimeZone({ path, systemTimeZone: () => "Asia/Taipei" });

  expect(await readReportTimeZone(path)).toEqual({
    ok: true,
    timeZone: "Asia/Taipei",
  });
});

test("S2-8: a corrupt stored file is treated as absent and replaced", async () => {
  const root = await tempRoot();
  const path = join(root, "report-timezone.json");
  await writeFile(path, "{not json", "utf8");

  const result = await setupReportTimeZone({
    path,
    systemTimeZone: () => "Asia/Taipei",
  });

  expect(result).toEqual({
    status: "written",
    timeZone: "Asia/Taipei",
    replacedCorrupt: true,
  });
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
    timeZone: "Asia/Taipei",
  });
});

test("S2-9: creates the data directory when it does not exist", async () => {
  const root = await tempRoot();
  const path = join(root, "nested", "data", "report-timezone.json");

  const result = await setupReportTimeZone({
    path,
    systemTimeZone: () => "Asia/Taipei",
  });

  expect(result.status).toBe("written");
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
    timeZone: "Asia/Taipei",
  });
});

test("S2-10: a failed write exits with a failure status", async () => {
  const root = await tempRoot();
  const path = join(root, "report-timezone.json");

  const result = await setupReportTimeZone({
    path,
    systemTimeZone: () => "Asia/Taipei",
    writeFile: async () => {
      throw new Error("disk full");
    },
  });

  expect(result).toEqual({ status: "write-failed" });
});
