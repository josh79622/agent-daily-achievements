import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createApp } from "./app.js";
import { createLocalCollector } from "../collector/local-collector.js";
import { createReportStore } from "../storage/report-store.js";
import {
  createLocalCommandExecutor,
  createMacTerminalLauncher,
  createProviderLoginService,
} from "../summarizer/provider-login.js";
import { createModelCatalogLoader } from "../summarizer/model-catalog.js";
import { createSummarizerModelsService } from "../summarizer/model-settings.js";
import {
  createProcessRunner,
  createReadinessProbe,
  osProbeTempDirs,
  readReplyFileFromDisk,
} from "../summarizer/readiness-probe.js";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "4317", 10);
const reportStore = createReportStore(resolve("data/reports"));
const collector = createLocalCollector({
  claudeDirectories: [join(homedir(), ".claude/projects")],
  codexDirectories: [
    join(homedir(), ".codex/sessions"),
    join(homedir(), ".codex/archived_sessions"),
  ],
});
// Model lists are fetched once at startup (decision M2); the approved
// zero-conversation readiness probe runs only when the user requests it from
// the local page (docs/plans/2026-09-17-readiness-probe-design.md).
const executor = createLocalCommandExecutor();
const macOS = process.platform === "darwin";
const modelCatalog = macOS
  ? createModelCatalogLoader({
      locate: (name) => executor.locate(name),
      runner: createProcessRunner(),
      tempDirs: osProbeTempDirs,
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
        tempDirs: osProbeTempDirs,
        readReplyFile: readReplyFileFromDisk,
      }),
      summaryModel: async (provider) =>
        summarizerModels?.effectiveModel(provider),
    })
  : undefined;
const server = createApp({
  collector,
  consentPath: resolve("data/local-sources.json"),
  providerLoginService,
  reportStore,
  summarizerModels,
  staticDirectory: resolve("dist/web"),
});

server.listen(port, host, () => {
  console.log(`Daily achievements demo: http://${host}:${port}`);
});
