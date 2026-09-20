import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createApp } from "./app.js";
import { createLocalCollector } from "../collector/local-collector.js";
import { createReportStore } from "../storage/report-store.js";
import type { SummaryProvider } from "../storage/summary-permission.js";
import {
  createLocalCommandExecutor,
  createMacTerminalLauncher,
  createProviderLoginService,
  executableName,
  summaryProviders,
} from "../summarizer/provider-login.js";
import { createModelCatalogLoader } from "../summarizer/model-catalog.js";
import { createSummarizerModelsService } from "../summarizer/model-settings.js";
import {
  createProcessRunner,
  createReadinessProbe,
  readReplyFileFromDisk,
} from "../summarizer/readiness-probe.js";
import { createSummaryRunner } from "../summarizer/summary-run.js";
import {
  createTrackedTempDirs,
  installShutdownCleanup,
  sweepStaleTempDirs,
} from "../summarizer/temp-dirs.js";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "4317", 10);
const reportStore = createReportStore(resolve("data/reports"));
const collector = createLocalCollector({
  claudeDirectories: [join(homedir(), ".claude/projects")],
  codexDirectories: [
    join(homedir(), ".codex/sessions"),
    join(homedir(), ".codex/archived_sessions"),
  ],
  antigravityDirectories: [join(homedir(), ".gemini/antigravity/brain")],
});
// Model lists are fetched once at startup (decision M2); the approved
// zero-conversation readiness probe runs only when the user requests it from
// the local page (docs/plans/2026-09-17-readiness-probe-design.md).
const executor = createLocalCommandExecutor();
const macOS = process.platform === "darwin";
// Remove leftovers from runs interrupted earlier, then clean up on stop.
await sweepStaleTempDirs();
const tempDirs = createTrackedTempDirs();
installShutdownCleanup({ tempDirs });
const modelCatalog = macOS
  ? createModelCatalogLoader({
      locate: (name) => executor.locate(name),
      runner: createProcessRunner(),
      tempDirs,
    })()
  : undefined;
const summarizerModels = modelCatalog
  ? createSummarizerModelsService({
      catalog: () => modelCatalog,
      settingsPath: resolve("data/summarizer-models.json"),
    })
  : undefined;
const providerLoginService = macOS
  ? createProviderLoginService({
      executor,
      launcher: createMacTerminalLauncher(),
      probe: createReadinessProbe({
        runner: createProcessRunner(),
        tempDirs,
        readReplyFile: readReplyFileFromDisk,
      }),
      summarySettings: async (provider) =>
        (await summarizerModels?.effectiveSettings(provider)) ?? {},
    })
  : undefined;
// Which CLI a report-generation request may try, checked once at startup by
// the same cheap `locate` used elsewhere here — not a readiness check (that
// spends a real model call and only runs on explicit request, decision C1).
const availableSummaryProviders: SummaryProvider[] = macOS
  ? (
      await Promise.all(
        summaryProviders.map(async (provider) =>
          (await executor.locate(executableName(provider)))
            ? provider
            : undefined,
        ),
      )
    ).filter((provider): provider is SummaryProvider => provider !== undefined)
  : [];
const summaryRunner = summarizerModels
  ? createSummaryRunner({
      locate: (provider) => executor.locate(executableName(provider)),
      models: summarizerModels,
      runner: createProcessRunner(),
      tempDirs,
      readReplyFile: readReplyFileFromDisk,
      reportStore,
    })
  : undefined;
const server = createApp({
  availableSummaryProviders,
  collector,
  consentPath: resolve("data/local-sources.json"),
  providerLoginService,
  reportStore,
  summarizerModels,
  summaryPermissionPath: resolve("data/summary-permission.json"),
  summaryRunner,
  staticDirectory: resolve("dist/web"),
});

server.listen(port, host, () => {
  console.log(`Daily achievements demo: http://${host}:${port}`);
});
