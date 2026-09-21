import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import {
  createLocalCollector,
  reportDateFor,
} from "../../src/collector/local-collector.js";

// Task S1 (docs/plans/2026-09-21-task-s1-seven-am-window-and-schedule-test-cases.md),
// test cases S1-1 to S1-8: the 07:00 report window's pure date function, and
// how it drives day collection. Decision:
// docs/decisions/2026-09-21-seven-am-report-window.md.

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function claudeMessage(
  sessionId: string,
  timestamp: string,
  text: string,
): string {
  return JSON.stringify({
    type: "user",
    sessionId,
    timestamp,
    uuid: `${sessionId}-${timestamp}`,
    message: { role: "user", content: text },
  });
}

async function collectorWithSessions(
  files: Record<string, string[]>,
  timeZone = "UTC",
) {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-seven-am-"));
  directories.push(root);
  const claudeDirectory = join(root, "claude");
  await mkdir(claudeDirectory);
  await Promise.all(
    Object.entries(files).map(([fileName, lines]) =>
      writeFile(join(claudeDirectory, `${fileName}.jsonl`), lines.join("\n")),
    ),
  );
  return createLocalCollector({
    claudeDirectories: [claudeDirectory],
    codexDirectories: [],
    timeZone,
  });
}

// --- The window ---

test("S1-1: a record at 09:00 on 18 Sep has report date 18 Sep", () => {
  expect(reportDateFor("2026-09-18T09:00:00Z", "UTC")).toBe("2026-09-18");
});

test("S1-2: a record at 01:30 on 19 Sep has report date 18 Sep", () => {
  expect(reportDateFor("2026-09-19T01:30:00Z", "UTC")).toBe("2026-09-18");
});

test("S1-3: a record at exactly 07:00 on 19 Sep has report date 19 Sep (start-inclusive)", () => {
  expect(reportDateFor("2026-09-19T07:00:00Z", "UTC")).toBe("2026-09-19");
});

test("S1-4: a record at 06:59:59 on 19 Sep has report date 18 Sep (end-exclusive)", () => {
  expect(reportDateFor("2026-09-19T06:59:59Z", "UTC")).toBe("2026-09-18");
});

test("S1-5: the stored timezone decides the report date, not the machine's", () => {
  // 2026-09-18T22:30:00Z is 2026-09-19 06:30 in Asia/Taipei (UTC+8) — still
  // inside the 18 Sep window — but 2026-09-19 08:30 in Australia/Sydney
  // (UTC+10, this machine's zone) — already inside the 19 Sep window. The
  // stored zone alone must decide.
  const timestamp = "2026-09-18T22:30:00Z";
  expect(reportDateFor(timestamp, "Asia/Taipei")).toBe("2026-09-18");
  expect(reportDateFor(timestamp, "Australia/Sydney")).toBe("2026-09-19");
});

test("S1-6: a daylight-saving change does not skip or double a day", () => {
  // America/New_York springs forward on 2026-03-08 at 02:00 EST -> 03:00 EDT.
  const timeZone = "America/New_York";
  // The evening before the change day, well clear of the transition.
  expect(reportDateFor("2026-03-07T20:00:00Z", timeZone)).toBe("2026-03-07");
  // The window still starts at local 07:00 on the change day itself...
  expect(reportDateFor("2026-03-08T11:00:00Z", timeZone)).toBe("2026-03-08");
  // ...end-exclusive, one second earlier is still the previous day...
  expect(reportDateFor("2026-03-08T10:59:59Z", timeZone)).toBe("2026-03-07");
  // ...and the following morning's 07:00 starts the next window on schedule,
  // so no day was skipped or doubled around the change.
  expect(reportDateFor("2026-03-09T11:00:00Z", timeZone)).toBe("2026-03-09");
});

// --- Collecting a day ---

test("S1-7: an 18 Sep report holds the 12:00 and 19 Sep 03:00 records, not the 06:00 one", async () => {
  const collector = await collectorWithSessions({
    "early-18th": [
      claudeMessage(
        "early-18th",
        "2026-09-18T06:00:00Z",
        "Still in the 17th's window",
      ),
    ],
    "midday-18th": [
      claudeMessage(
        "midday-18th",
        "2026-09-18T12:00:00Z",
        "In the 18th's window",
      ),
    ],
    "small-hours-19th": [
      claudeMessage(
        "small-hours-19th",
        "2026-09-19T03:00:00Z",
        "Still in the 18th's window",
      ),
    ],
  });

  const result = await collector.collect("2026-09-18", ["claude-code"]);

  const texts = result.sessions.flatMap((session) =>
    session.messages.map((message) => message.text),
  );
  expect(texts.sort()).toEqual(
    ["In the 18th's window", "Still in the 18th's window"].sort(),
  );
  expect(texts).not.toContain("Still in the 17th's window");
});

test("S1-8: a session active in the 18 Sep window keeps its earlier context", async () => {
  const collector = await collectorWithSessions({
    "cross-window": [
      claudeMessage("cross-window", "2026-09-17T10:00:00Z", "Earlier context"),
      claudeMessage(
        "cross-window",
        "2026-09-18T08:00:00Z",
        "Just inside the 18th's window",
      ),
    ],
  });

  const result = await collector.collect("2026-09-18", ["claude-code"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Earlier context",
    "Just inside the 18th's window",
  ]);
});
