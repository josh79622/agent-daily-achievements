import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import { generateSampleReport } from "../../src/domain/generate-sample-report.js";
import { sampleRecords } from "../../src/domain/sample-records.js";
import { createReportStore } from "../../src/storage/report-store.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test("returns a distinct missing result before a report is saved", async () => {
  const directory = await mkdtemp(join(tmpdir(), "daily-report-store-"));
  directories.push(directory);
  const store = createReportStore(directory);

  expect(await store.readLatest()).toEqual({ found: false });
});

test("writes and reads back the same report", async () => {
  const directory = await mkdtemp(join(tmpdir(), "daily-report-store-"));
  directories.push(directory);
  const store = createReportStore(directory);
  const report = generateSampleReport(sampleRecords, "2026-09-16");

  await store.save(report);

  expect(await store.readLatest()).toEqual({ found: true, report });
});
