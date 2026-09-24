#!/usr/bin/env node
// The launchd job's Node entry point. A separate entry point from the web
// server (docs/decisions/2026-09-21-seven-am-report-window.md: "It does not
// need the server"), wired the same way src/server/index.ts wires the
// collector, report store, models, and providers, minus createApp/listen.
//
// Not run by `npm run check` or any test: like src/server/index.ts, its real
// wiring (real filesystem paths, real provider CLIs) is exercised by hand,
// never by an automated test (see the plan's "Verification beyond unit
// tests"). All the decision logic it calls (runScheduledReport) is unit
// tested against fakes in test/schedule/.

import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createLocalCollector } from "../collector/local-collector.js";
import { buildReportDayPayload } from "../report/report-day-payload.js";
import { createReportStore } from "../storage/report-store.js";
import { readReportTimeZone } from "../storage/report-timezone.js";
import { readSummaryPermission } from "../storage/summary-permission.js";
import type { SummaryProvider } from "../storage/summary-permission.js";
import {
  createLocalCommandExecutor,
  executableName,
  summaryProviders,
} from "../summarizer/provider-login.js";
import { createModelCatalogLoader } from "../summarizer/model-catalog.js";
import { createSummarizerModelsService } from "../summarizer/model-settings.js";
import {
  createProcessRunner,
  readReplyFileFromDisk,
} from "../summarizer/readiness-probe.js";
import { createSummaryRunner } from "../summarizer/summary-run.js";
import {
  createTrackedTempDirs,
  installShutdownCleanup,
  sweepStaleTempDirs,
} from "../summarizer/temp-dirs.js";
import { runScheduledReport } from "./run-scheduled-report.js";

async function main(): Promise<number> {
  const reportStore = createReportStore(resolve("data/reports"));
  const collector = createLocalCollector({
    claudeDirectories: [join(homedir(), ".claude/projects")],
    codexDirectories: [
      join(homedir(), ".codex/sessions"),
      join(homedir(), ".codex/archived_sessions"),
    ],
    antigravityDirectories: [join(homedir(), ".gemini/antigravity/brain")],
  });
  const executor = createLocalCommandExecutor();
  await sweepStaleTempDirs();
  const tempDirs = createTrackedTempDirs();
  installShutdownCleanup({ tempDirs });
  const modelCatalog = createModelCatalogLoader({
    locate: (name) => executor.locate(name),
    runner: createProcessRunner(),
    tempDirs,
  })();
  const summarizerModels = createSummarizerModelsService({
    catalog: () => modelCatalog,
    settingsPath: resolve("data/summarizer-models.json"),
  });
  const availableSummaryProviders: SummaryProvider[] = (
    await Promise.all(
      summaryProviders.map(async (provider) =>
        (await executor.locate(executableName(provider)))
          ? provider
          : undefined,
      ),
    )
  ).filter((provider): provider is SummaryProvider => provider !== undefined);

  const result = await runScheduledReport({
    now: () => new Date(),
    readReportTimeZone: () =>
      readReportTimeZone(resolve("data/report-timezone.json")),
    reportStore,
    readPermission: () =>
      readSummaryPermission(resolve("data/summary-permission.json")),
    buildPayload: (date, sourceScope) =>
      buildReportDayPayload({ collector, date, sourceScope }),
    availableSummaryProviders,
    createRunner: (store) =>
      createSummaryRunner({
        locate: (provider) => executor.locate(executableName(provider)),
        models: summarizerModels,
        runner: createProcessRunner(),
        tempDirs,
        readReplyFile: readReplyFileFromDisk,
        reportStore: store,
      }),
  });

  switch (result.status) {
    case "generated": {
      console.log(
        `Generated the report for ${result.date} with ${result.provider}.`,
      );
      return 0;
    }
    case "skipped":
      console.log(`${result.date} already has a report; nothing to do.`);
      return 0;
    case "declined":
      console.error(
        result.reason === "no-timezone"
          ? "No usable stored report timezone; not generating a report."
          : "No summarization permission saved; not generating a report.",
      );
      return 1;
    case "failed": {
      console.error(`Report for ${result.date} failed: ${result.reason}`);
      return 1;
    }
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
