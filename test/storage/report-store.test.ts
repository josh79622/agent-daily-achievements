import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateSampleReport } from "../../src/domain/generate-sample-report.js";
import { sampleRecords } from "../../src/domain/sample-records.js";
import { createReportStore } from "../../src/storage/report-store.js";

test("returns a distinct missing result before a report is saved", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "daily-report-store-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const store = createReportStore(directory);

  assert.deepEqual(await store.readLatest(), { found: false });
});

test("writes and reads back the same report", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "daily-report-store-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const store = createReportStore(directory);
  const report = generateSampleReport(sampleRecords, "2026-09-16");

  await store.save(report);

  assert.deepEqual(await store.readLatest(), { found: true, report });
});
