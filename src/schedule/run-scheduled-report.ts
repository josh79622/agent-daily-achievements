// The launchd job's core logic: pick the most recently finished 07:00-07:00
// window, and generate its report if (and only if) it does not already
// exist. Design: docs/plans/2026-09-21-task-s1-seven-am-window-and-schedule-test-cases.md.
// Decisions: docs/decisions/2026-09-21-seven-am-report-window.md,
// docs/decisions/2026-09-17-local-timezone-scheduling.md.
//
// This has no dependency on the HTTP server (src/server/app.ts): it is a
// separate entry point, wired directly to the collector, report store, and
// summarizer, the way docs/decisions/2026-09-21-seven-am-report-window.md
// requires ("It does not need the server").

import type { LocalSource } from "../collector/local-collector.js";
import type { ReportDayPayload } from "../report/report-day-payload.js";
import type { AchievementReportV1 } from "../report/contract.js";
import type { ReportStore } from "../storage/report-store.js";
import type { ReportTimeZoneResult } from "../storage/report-timezone.js";
import type {
  SummaryPermission,
  SummaryProvider,
} from "../storage/summary-permission.js";
import type { SummaryRequest, SummaryRunner } from "../server/app.js";
import {
  orderedProviders,
  providerName,
} from "../summarizer/provider-order.js";
import { mostRecentFinishedWindow } from "./report-window.js";

export type ScheduledRunResult =
  | { status: "generated"; date: string; provider: SummaryProvider }
  | { status: "skipped"; date: string; reason: "already-generated" }
  | { status: "declined"; reason: "no-timezone" | "no-permission" }
  | { status: "failed"; date: string; reason: string };

export interface ScheduledRunDeps {
  now: () => Date;
  readReportTimeZone: () => Promise<ReportTimeZoneResult>;
  reportStore: ReportStore;
  readPermission: () => Promise<SummaryPermission | undefined>;
  buildPayload: (
    date: string,
    sourceScope: LocalSource[],
  ) => Promise<ReportDayPayload>;
  availableSummaryProviders: SummaryProvider[];
  /**
   * Optional update handoff. It is deliberately invoked only after a report
   * has been saved successfully; update failures must not rewrite a completed
   * report result.
   */
  checkForAutomaticUpdate?: () => Promise<void>;
  /**
   * Builds a runner bound to a report store of the caller's choosing. Real
   * wiring passes `createSummaryRunner` a store that only actually reaches
   * disk once this function has decided the run succeeded (see
   * `createCapturingReportStore`), so a failed attempt never leaves a
   * partial report behind (S1-15).
   */
  createRunner: (reportStore: ReportStore) => SummaryRunner;
}

export async function runScheduledReport(
  deps: ScheduledRunDeps,
): Promise<ScheduledRunResult> {
  const zone = await deps.readReportTimeZone();
  if (!zone.ok) return { status: "declined", reason: "no-timezone" };

  const date = mostRecentFinishedWindow(deps.now(), zone.timeZone);

  const existing = await deps.reportStore.read(date);
  if (existing.found)
    return { status: "skipped", date, reason: "already-generated" };

  const permission = await deps.readPermission();
  if (!permission?.sourceScope.length)
    return { status: "declined", reason: "no-permission" };

  const payload = await deps.buildPayload(date, permission.sourceScope);
  const request: SummaryRequest = {
    scheduled: true,
    payload,
    language: permission.summaryLanguage,
  };

  const providers = orderedProviders(
    deps.availableSummaryProviders,
    permission.preferredCli,
  );
  if (providers.length === 0)
    return {
      status: "failed",
      date,
      reason: "No approved summarizer CLI is available.",
    };

  const capture = createCapturingReportStore(deps.reportStore);
  const runner = deps.createRunner(capture.store);
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      await runner.run(provider, request);
      const report = capture.take();
      if (report) await deps.reportStore.save(report);
      if (deps.checkForAutomaticUpdate) {
        try {
          await deps.checkForAutomaticUpdate();
        } catch {
          // The update service owns its safe error record. A completed report
          // stays completed even if its follow-up update check fails.
        }
      }
      return { status: "generated", date, provider };
    } catch (error) {
      capture.take(); // discard anything the failed attempt captured
      failures.push(
        `${providerName(provider)} failed: ${errorMessage(error)}.`,
      );
    }
  }
  return { status: "failed", date, reason: failures.join(" ") };
}

/**
 * A `ReportStore` whose `save` is captured in memory instead of reaching
 * disk. `take()` returns and clears whatever was captured. The real report
 * store is only ever written to by the caller, and only once a run has
 * actually succeeded — never by a failed attempt (S1-15).
 */
export function createCapturingReportStore(realStore: ReportStore): {
  store: ReportStore;
  take: () => AchievementReportV1 | undefined;
} {
  let captured: AchievementReportV1 | undefined;
  return {
    store: {
      async save(report) {
        captured = report;
      },
      read: (date) => realStore.read(date),
      readLatest: () => realStore.readLatest(),
      listDates: () => realStore.listDates(),
    },
    take() {
      const report = captured;
      captured = undefined;
      return report;
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
