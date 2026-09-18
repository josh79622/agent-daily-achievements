import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import type { AchievementReportV1 } from "../../src/report/contract.js";
import { createReportStore } from "../../src/storage/report-store.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function sampleReport(): AchievementReportV1 {
  return {
    schemaVersion: 1,
    date: "2026-09-16",
    timezone: "Australia/Sydney",
    status: "complete",
    achievements: [
      {
        id: "wrote-payload-builder",
        category: "progress",
        title: "Wrote the report-day payload builder",
        detail: "Added buildReportDayPayload with a passing test suite.",
        evidence: [
          { source: "codex", recordId: "codex-1", messageIds: ["m1"] },
        ],
      },
    ],
    coverage: [{ source: "codex", state: "included" }],
    incomplete: [],
  };
}

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
  const report = sampleReport();

  await store.save(report);

  expect(await store.readLatest()).toEqual({ found: true, report });
});
