import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createApp } from "./app.js";
import { createLocalCollector } from "../collector/local-collector.js";
import { createReportStore } from "../storage/report-store.js";

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
const server = createApp({
  collector,
  consentPath: resolve("data/local-sources.json"),
  reportStore,
  staticDirectory: resolve("dist/web"),
});

server.listen(port, host, () => {
  console.log(`Daily achievements demo: http://${host}:${port}`);
});
