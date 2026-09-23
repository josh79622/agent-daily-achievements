import { expect, test } from "vitest";

import type { AchievementReportV1 } from "../../src/report/contract.js";
import type {
  ReadReportResult,
  ReportStore,
} from "../../src/storage/report-store.js";
import type { ReportTimeZoneResult } from "../../src/storage/report-timezone.js";
import type { SummaryPermission } from "../../src/storage/summary-permission.js";
import type { SummaryRunner } from "../../src/server/app.js";
import {
  runScheduledReport,
  type ScheduledRunDeps,
} from "../../src/schedule/run-scheduled-report.js";

// Task S1, test cases S1-9 to S1-16
// (docs/plans/2026-09-21-task-s1-seven-am-window-and-schedule-test-cases.md).
// Every dependency (clock, timezone, report store, permission, payload
// builder, and summary runner) is a fake; no real CLI is ever invoked.

function fakeReportStore(
  seed: Record<string, AchievementReportV1> = {},
): ReportStore & {
  saved: AchievementReportV1[];
} {
  const reports = new Map(Object.entries(seed));
  const saved: AchievementReportV1[] = [];
  return {
    saved,
    async save(report) {
      reports.set(report.date, report);
      saved.push(report);
    },
    async read(date): Promise<ReadReportResult> {
      const report = reports.get(date);
      return report ? { found: true, report } : { found: false };
    },
    async readLatest(): Promise<ReadReportResult> {
      const dates = [...reports.keys()].sort();
      const latest = dates.at(-1);
      return latest
        ? { found: true, report: reports.get(latest)! }
        : { found: false };
    },
    async listDates() {
      return [...reports.keys()].sort();
    },
  };
}

function fakeReport(date: string): AchievementReportV1 {
  return {
    schemaVersion: 1,
    date,
    timezone: "UTC",
    status: "complete",
    achievements: [],
    coverage: [],
    incomplete: [],
  };
}

function baseDeps(
  overrides: Partial<ScheduledRunDeps> & {
    reportStore?: ReturnType<typeof fakeReportStore>;
  } = {},
): ScheduledRunDeps & {
  calls: { buildPayload: number; createRunner: number };
} {
  const calls = { buildPayload: 0, createRunner: 0 };
  const permission: SummaryPermission = {
    sourceScope: ["claude-code"],
    recipients: ["claude-code", "codex"],
  };
  return {
    now: () => new Date("2026-09-19T07:00:00Z"),
    readReportTimeZone: async (): Promise<ReportTimeZoneResult> => ({
      ok: true,
      timeZone: "UTC",
    }),
    reportStore: fakeReportStore(),
    readPermission: async () => permission,
    buildPayload: async (date) => {
      calls.buildPayload += 1;
      return {
        date,
        timeZone: "UTC",
        payloadJson: JSON.stringify({ date, conversations: [] }),
        manifest: [],
        coverage: [],
        byteLength: 2,
      };
    },
    availableSummaryProviders: ["claude-code"],
    createRunner: (store): SummaryRunner => {
      calls.createRunner += 1;
      return {
        async run(_provider, request) {
          await store.save(fakeReport(request.payload.date));
        },
      };
    },
    calls,
    ...overrides,
  };
}

test("S1-9: at 07:00 on 19 Sep the job picks 18 Sep as the window to generate", async () => {
  const deps = baseDeps();

  const result = await runScheduledReport(deps);

  expect(result).toMatchObject({ status: "generated", date: "2026-09-18" });
});

test("S1-10: when the 18 Sep report already exists, the job generates nothing and calls no provider", async () => {
  const reportStore = fakeReportStore({
    "2026-09-18": fakeReport("2026-09-18"),
  });
  const deps = baseDeps({ reportStore });

  const result = await runScheduledReport(deps);

  expect(result).toEqual({
    status: "skipped",
    date: "2026-09-18",
    reason: "already-generated",
  });
  expect(deps.calls.buildPayload).toBe(0);
  expect(deps.calls.createRunner).toBe(0);
  expect(reportStore.saved).toEqual([]);
});

test("S1-11: with no report for 18 Sep, the job generates exactly one report, for 18 Sep", async () => {
  const reportStore = fakeReportStore();
  const deps = baseDeps({ reportStore });

  const result = await runScheduledReport(deps);

  expect(result).toMatchObject({ status: "generated", date: "2026-09-18" });
  expect(reportStore.saved).toHaveLength(1);
  expect(reportStore.saved[0]?.date).toBe("2026-09-18");
});

test("S1-12: after four missed days, the job generates only the most recent finished window", async () => {
  // The Mac wakes on 22 Sep at 07:05; nothing was generated since 17 Sep.
  const reportStore = fakeReportStore({
    "2026-09-17": fakeReport("2026-09-17"),
  });
  const deps = baseDeps({
    reportStore,
    now: () => new Date("2026-09-22T07:05:00Z"),
  });

  const result = await runScheduledReport(deps);

  expect(result).toMatchObject({ status: "generated", date: "2026-09-21" });
  expect(reportStore.saved.map((report) => report.date)).toEqual([
    "2026-09-21",
  ]);
  // The older missed days (18, 19, 20) stay empty: the job never touched them.
  expect(await reportStore.read("2026-09-18")).toEqual({ found: false });
  expect(await reportStore.read("2026-09-19")).toEqual({ found: false });
  expect(await reportStore.read("2026-09-20")).toEqual({ found: false });
});

test("S1-13: a second run the same morning generates nothing", async () => {
  const reportStore = fakeReportStore();
  const deps = baseDeps({ reportStore });

  const first = await runScheduledReport(deps);
  expect(first).toMatchObject({ status: "generated", date: "2026-09-18" });

  const beforeSecond = deps.calls.buildPayload;
  const second = await runScheduledReport(deps);

  expect(second).toEqual({
    status: "skipped",
    date: "2026-09-18",
    reason: "already-generated",
  });
  expect(deps.calls.buildPayload).toBe(beforeSecond);
  expect(reportStore.saved).toHaveLength(1);
});

test("S1-14: with no summarizer permission saved, the job generates nothing and says why", async () => {
  const deps = baseDeps({ readPermission: async () => undefined });

  const result = await runScheduledReport(deps);

  expect(result).toEqual({ status: "declined", reason: "no-permission" });
  expect(deps.calls.buildPayload).toBe(0);
  expect(deps.calls.createRunner).toBe(0);
});

test("S1-15: when the provider fails, the job fails and writes no partial report", async () => {
  const reportStore = fakeReportStore();
  const deps = baseDeps({
    reportStore,
    createRunner: (store): SummaryRunner => ({
      async run(_provider, request) {
        // Mirrors the real summary runner: it may save an "unavailable"
        // report to whatever store it was given before throwing.
        await store.save(fakeReport(request.payload.date));
        throw new Error("provider exited non-zero");
      },
    }),
  });

  const result = await runScheduledReport(deps);

  expect(result.status).toBe("failed");
  expect(reportStore.saved).toEqual([]);
  expect(await reportStore.read("2026-09-18")).toEqual({ found: false });
});

test("S1-16: with an unreadable stored timezone, the job does not invent one", async () => {
  const deps = baseDeps({
    readReportTimeZone: async (): Promise<ReportTimeZoneResult> => ({
      ok: false,
    }),
  });

  const result = await runScheduledReport(deps);

  expect(result).toEqual({ status: "declined", reason: "no-timezone" });
  expect(deps.calls.buildPayload).toBe(0);
  expect(deps.calls.createRunner).toBe(0);
});

test("automatic updates are checked once only after a scheduled report has finished", async () => {
  let updateChecks = 0;
  const deps = baseDeps({
    checkForAutomaticUpdate: async () => {
      updateChecks += 1;
    },
  });

  await expect(runScheduledReport(deps)).resolves.toMatchObject({
    status: "generated",
  });
  expect(updateChecks).toBe(1);
});

test("a failed scheduled report does not trigger an automatic update", async () => {
  let updateChecks = 0;
  const deps = baseDeps({
    checkForAutomaticUpdate: async () => {
      updateChecks += 1;
    },
    createRunner: (): SummaryRunner => ({
      async run() {
        throw new Error("report failed");
      },
    }),
  });

  await expect(runScheduledReport(deps)).resolves.toMatchObject({
    status: "failed",
  });
  expect(updateChecks).toBe(0);
});
