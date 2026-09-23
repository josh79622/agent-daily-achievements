import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

import type { AchievementReportV1 } from "../../src/report/contract.js";
import {
  createReportStore,
  type ReportVersion,
} from "../../src/storage/report-store.js";

const directories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
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

test("retains every regenerated version and reads the newest one by default", async () => {
  const store = await freshStore();
  const first = sampleReport();
  const achievement = sampleReport().achievements[0]!;
  const regenerated = {
    ...sampleReport(),
    achievements: [{ ...achievement, title: "Regenerated" }],
  };

  await store.save(first);
  const firstVersion = (await store.listVersions(first.date))[0]!;
  await store.save(regenerated);
  const regeneratedVersion = (await store.listVersions(first.date))[0]!;

  const versions = await store.listVersions(first.date);
  expect(versions).toHaveLength(2);
  expect(versions.map((version) => version.id)).toEqual([
    regeneratedVersion.id,
    firstVersion.id,
  ]);
  expect(versions.map((version) => version.report)).toEqual([
    regenerated,
    first,
  ]);
  expect(await store.read(first.date)).toEqual({
    found: true,
    report: regenerated,
  });
});

test("preserves a flat legacy report as a stable synthetic version", async () => {
  const store = await freshStore();
  const legacy = sampleReport();
  const legacyPath = join(directories.at(-1)!, `${legacy.date}.json`);
  const modifiedAt = new Date("2026-09-17T03:04:05.000Z");

  await writeFile(legacyPath, `${JSON.stringify(legacy)}\n`, "utf8");
  await utimes(legacyPath, modifiedAt, modifiedAt);

  const versions = await store.listVersions(legacy.date);
  expect(versions).toEqual<ReportVersion[]>([
    {
      id: "legacy-2026-09-16",
      generatedAt: modifiedAt.toISOString(),
      report: legacy,
    },
  ]);
  expect(await store.readVersion(legacy.date, "legacy-2026-09-16")).toEqual({
    found: true,
    version: versions[0],
  });
});

test("replaces a legacy version atomically in its flat file without affecting stored versions", async () => {
  const store = await freshStore();
  const generatedReport = sampleReport();
  await store.save(generatedReport);
  const generated = (await store.listVersions(generatedReport.date))[0]!;
  const achievement = sampleReport().achievements[0]!;
  const legacy = {
    ...sampleReport(),
    achievements: [{ ...achievement, title: "Legacy" }],
  };
  const replacement = {
    ...legacy,
    achievements: [{ ...legacy.achievements[0]!, title: "Corrected legacy" }],
  };
  const directory = directories.at(-1)!;
  const legacyPath = join(directory, `${legacy.date}.json`);

  await writeFile(legacyPath, `${JSON.stringify(legacy)}\n`, "utf8");
  await store.replaceVersion(legacy.date, "legacy-2026-09-16", replacement);

  expect(JSON.parse(await readFile(legacyPath, "utf8"))).toEqual(replacement);
  expect(await store.listVersions(legacy.date)).toEqual(
    expect.arrayContaining([
      generated,
      expect.objectContaining({
        id: "legacy-2026-09-16",
        report: replacement,
      }),
    ]),
  );
});

test("retains a legacy version's original display time and order when edited", async () => {
  const store = await freshStore();
  const legacy = sampleReport();
  const legacyPath = join(directories.at(-1)!, `${legacy.date}.json`);
  const legacyTime = new Date("2020-01-02T03:04:05.000Z");
  const generated = {
    ...sampleReport(),
    achievements: [
      { ...sampleReport().achievements[0]!, title: "Generated later" },
    ],
  };
  const replacement = {
    ...legacy,
    achievements: [{ ...legacy.achievements[0]!, title: "Corrected legacy" }],
  };

  await writeFile(legacyPath, `${JSON.stringify(legacy)}\n`, "utf8");
  await utimes(legacyPath, legacyTime, legacyTime);
  await store.save(generated);
  const legacyVersion = await store.readVersion(
    legacy.date,
    "legacy-2026-09-16",
  );

  await store.replaceVersion(legacy.date, "legacy-2026-09-16", replacement);

  expect(await store.readVersion(legacy.date, "legacy-2026-09-16")).toEqual({
    found: true,
    version: expect.objectContaining({
      generatedAt: legacyVersion.found
        ? legacyVersion.version.generatedAt
        : undefined,
      report: replacement,
    }),
  });
  expect((await store.listVersions(legacy.date))[0]!.report).toEqual(generated);
});

test("does not list an empty report-date directory as a saved report", async () => {
  const store = await freshStore();
  await mkdir(join(directories.at(-1)!, "2026-09-16"));

  expect(await store.listDates()).toEqual([]);
  expect(await store.readLatest()).toEqual({ found: false });
});

test("orders same-millisecond saves from separate stores deterministically", async () => {
  const firstStore = await freshStore();
  const secondStore = createReportStore(directories.at(-1)!);
  vi.spyOn(Date, "now").mockReturnValue(1_789_000_000_000);
  const first = sampleReport();
  const second = {
    ...sampleReport(),
    achievements: [{ ...sampleReport().achievements[0]!, title: "Second" }],
  };

  await firstStore.save(first);
  await secondStore.save(second);

  const versions = await firstStore.listVersions(first.date);
  expect(versions.map((version) => version.generatedAt)).toEqual([
    new Date(1_789_000_000_000).toISOString(),
    new Date(1_789_000_000_000).toISOString(),
  ]);
  expect(versions.map((version) => version.report)).toEqual([second, first]);
});

test("replaces only the named version without adding a new one", async () => {
  const store = await freshStore();
  const firstReport = sampleReport();
  const achievement = sampleReport().achievements[0]!;
  await store.save(firstReport);
  const first = (await store.listVersions(firstReport.date))[0]!;
  await store.save({
    ...sampleReport(),
    achievements: [{ ...achievement, title: "Second" }],
  });
  const second = (await store.listVersions(firstReport.date))[0]!;
  const replacement = {
    ...first.report,
    achievements: [{ ...first.report.achievements[0]!, title: "Corrected" }],
  };

  const replaced = await store.replaceVersion(
    first.report.date,
    first.id,
    replacement,
  );

  expect(replaced).toEqual({ ...first, report: replacement });
  expect(await store.listVersions(first.report.date)).toEqual([
    second,
    { ...first, report: replacement },
  ]);
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
