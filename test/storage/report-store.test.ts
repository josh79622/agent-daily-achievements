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

function sampleReport(date = "2026-09-16"): AchievementReportV1 {
  return {
    schemaVersion: 1,
    date,
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

async function freshStore() {
  const directory = await mkdtemp(join(tmpdir(), "daily-report-store-"));
  directories.push(directory);
  return createReportStore(directory);
}

test("returns a distinct missing result before a report is saved", async () => {
  const store = await freshStore();

  expect(await store.readLatest()).toEqual({ found: false });
  expect(await store.read("2026-09-16")).toEqual({ found: false });
  expect(await store.listDates()).toEqual([]);
});

test("writes and reads back the same report", async () => {
  const store = await freshStore();
  const report = sampleReport();

  await store.save(report);

  expect(await store.readLatest()).toEqual({ found: true, report });
  expect(await store.read(report.date)).toEqual({ found: true, report });
});

test("retention: saving a later date keeps the earlier one, not just the latest", async () => {
  const store = await freshStore();
  const earlier = sampleReport("2026-09-04");
  const later = sampleReport("2026-09-09");

  await store.save(earlier);
  await store.save(later);

  expect(await store.read(earlier.date)).toEqual({
    found: true,
    report: earlier,
  });
  expect(await store.read(later.date)).toEqual({ found: true, report: later });
  expect(await store.readLatest()).toEqual({ found: true, report: later });
});

test("retention: readLatest is by date, not by save order", async () => {
  const store = await freshStore();
  const earlier = sampleReport("2026-09-04");
  const later = sampleReport("2026-09-09");

  // Saved out of chronological order: the later date is written first.
  await store.save(later);
  await store.save(earlier);

  expect(await store.readLatest()).toEqual({ found: true, report: later });
});

test("retention: listDates returns every saved date, ascending, once each", async () => {
  const store = await freshStore();
  const dates = ["2026-09-09", "2026-09-04", "2026-09-16"];
  for (const date of dates) await store.save(sampleReport(date));
  // Re-saving an existing date (e.g. a re-generated report) must not add a
  // second entry.
  await store.save(sampleReport("2026-09-09"));

  expect(await store.listDates()).toEqual([
    "2026-09-04",
    "2026-09-09",
    "2026-09-16",
  ]);
});

test("rejects a report date that is not a plain YYYY-MM-DD string", async () => {
  const store = await freshStore();

  await expect(store.save(sampleReport("2026-9-9"))).rejects.toThrow();
  await expect(store.save(sampleReport("../escaped"))).rejects.toThrow();
  await expect(store.read("not-a-date")).rejects.toThrow();
});
