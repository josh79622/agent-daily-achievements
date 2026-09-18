// One-off real run: boots the exact production wiring (mirrors
// src/server/index.ts) but with reportDate overridden to a specific past
// day, so the real /api/summarizer/permission and /api/reports/generate
// routes can be exercised end to end without waiting for "today". Approved
// by Josh in chat for 2026-09-09 with Claude Code haiku preferred.
import { once } from "node:events";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createApp } from "../../src/server/app.js";
import { createLocalCollector } from "../../src/collector/local-collector.js";
import { createReportStore } from "../../src/storage/report-store.js";
import {
  createLocalCommandExecutor,
  createMacTerminalLauncher,
  createProviderLoginService,
  executableName,
  summaryProviders,
} from "../../src/summarizer/provider-login.js";
import { createModelCatalogLoader } from "../../src/summarizer/model-catalog.js";
import { createSummarizerModelsService } from "../../src/summarizer/model-settings.js";
import {
  createProcessRunner,
  createReadinessProbe,
  readReplyFileFromDisk,
} from "../../src/summarizer/readiness-probe.js";
import { createSummaryRunner } from "../../src/summarizer/summary-run.js";
import {
  createTrackedTempDirs,
  installShutdownCleanup,
  sweepStaleTempDirs,
} from "../../src/summarizer/temp-dirs.js";

const targetDate = process.argv[2];
if (!targetDate) throw new Error("Usage: run-real-day.mts <YYYY-MM-DD>");

const reportStore = createReportStore(resolve("data/reports"));
const collector = createLocalCollector({
  claudeDirectories: [join(homedir(), ".claude/projects")],
  codexDirectories: [
    join(homedir(), ".codex/sessions"),
    join(homedir(), ".codex/archived_sessions"),
  ],
});
const executor = createLocalCommandExecutor();
await sweepStaleTempDirs();
const tempDirs = createTrackedTempDirs();
installShutdownCleanup({ tempDirs });
const modelCatalog = await createModelCatalogLoader({
  locate: (name) => executor.locate(name),
  runner: createProcessRunner(),
  tempDirs,
})();
const summarizerModels = createSummarizerModelsService({
  catalog: () => modelCatalog,
  settingsPath: resolve("data/summarizer-models.json"),
});
const providerLoginService = createProviderLoginService({
  executor,
  launcher: createMacTerminalLauncher(),
  probe: createReadinessProbe({
    runner: createProcessRunner(),
    tempDirs,
    readReplyFile: readReplyFileFromDisk,
  }),
  summarySettings: async (provider) =>
    (await summarizerModels.effectiveSettings(provider)) ?? {},
});
const availableSummaryProviders = (
  await Promise.all(
    summaryProviders.map(async (provider) =>
      (await executor.locate(executableName(provider))) ? provider : undefined,
    ),
  )
).filter((p): p is (typeof summaryProviders)[number] => p !== undefined);
const summaryRunner = createSummaryRunner({
  locate: (provider) => executor.locate(executableName(provider)),
  models: summarizerModels,
  runner: createProcessRunner(),
  tempDirs,
  readReplyFile: readReplyFileFromDisk,
  reportStore,
});

const server = createApp({
  availableSummaryProviders,
  collector,
  consentPath: resolve("data/local-sources.json"),
  providerLoginService,
  reportStore,
  reportDate: () => targetDate,
  summarizerModels,
  summaryPermissionPath: resolve("data/summary-permission.json"),
  summaryRunner,
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;

const putPermission = await fetch(`${base}/api/summarizer/permission`, {
  method: "PUT",
  headers: { origin: base, "content-type": "application/json" },
  body: JSON.stringify({
    sourceScope: ["claude-code", "codex"],
    preferredCli: "claude-code",
  }),
});
console.log("PUT /api/summarizer/permission ->", putPermission.status);
console.log(await putPermission.text());

console.log(`\nGenerating for ${targetDate} with Claude Code preferred...`);
const generate = await fetch(`${base}/api/reports/generate`, {
  method: "POST",
  headers: { origin: base, "content-type": "application/json" },
  body: JSON.stringify({ scheduled: false }),
});
console.log("POST /api/reports/generate ->", generate.status);
console.log(await generate.text());

const latest = await fetch(`${base}/api/reports/latest`);
console.log("\nGET /api/reports/latest ->", latest.status);
console.log(JSON.stringify(await latest.json(), null, 2));

server.close();
await once(server, "close");
