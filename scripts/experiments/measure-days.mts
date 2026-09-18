// One-off local measurement: byteLength of buildReportDayPayload per day.
// Local sizes only; nothing is transmitted, nothing but the date and byte
// count is printed. Same disclosure basis as PROGRESS.md's "Measured payload
// cost" section.
import { homedir } from "node:os";
import { join } from "node:path";

import { createLocalCollector } from "../../src/collector/local-collector.js";
import { buildReportDayPayload } from "../../src/report/report-day-payload.js";

const collector = createLocalCollector({
  claudeDirectories: [join(homedir(), ".claude/projects")],
  codexDirectories: [
    join(homedir(), ".codex/sessions"),
    join(homedir(), ".codex/archived_sessions"),
  ],
});

const dates = process.argv.slice(2);
for (const date of dates) {
  const payload = await buildReportDayPayload({
    collector,
    date,
    sourceScope: ["claude-code", "codex"],
  });
  const estimatedTokens = Math.round(payload.byteLength / 4);
  console.log(
    `${date}  bytes=${payload.byteLength}  ~tokens=${estimatedTokens}  coverage=${JSON.stringify(payload.coverage)}`,
  );
}
