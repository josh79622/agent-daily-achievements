import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import { createLocalCollector } from "../../src/collector/local-collector.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function collectorWithClaudeMessages(
  timestamps: string[],
  timeZone?: string,
) {
  const directory = await mkdtemp(join(tmpdir(), "daily-proof-timezone-"));
  directories.push(directory);
  await mkdir(join(directory, "sessions"));
  await writeFile(
    join(directory, "sessions", "timezone.jsonl"),
    timestamps
      .map((timestamp, index) =>
        JSON.stringify({
          sessionId: "timezone-session",
          timestamp,
          uuid: `message-${index}`,
          message: { role: "user", content: `Synthetic message ${index}` },
        }),
      )
      .join("\n"),
  );
  return createLocalCollector({
    claudeDirectories: [directory],
    codexDirectories: [],
    ...(timeZone ? { timeZone } : {}),
  });
}

function computerDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

test("TZ-1: uses the computer's current timezone when none is configured", async () => {
  const timestamp = "2026-09-16T00:30:00Z";
  const collector = await collectorWithClaudeMessages([timestamp]);

  const result = await collector.collect(computerDate(timestamp), [
    "claude-code",
  ]);

  expect(result.sessions).toHaveLength(1);
});

test("TZ-2: separates messages on opposite sides of midnight in the selected timezone", async () => {
  const collector = await collectorWithClaudeMessages(
    ["2026-09-16T06:59:59Z", "2026-09-16T07:00:00Z"],
    "America/Los_Angeles",
  );

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.messageCount).toBe(1);
  expect(result.sessions[0]?.messages[0]?.timestamp).toBe(
    "2026-09-16T07:00:00Z",
  );
});

test("TZ-3: classifies a UTC timestamp by a non-Sydney timezone", async () => {
  const collector = await collectorWithClaudeMessages(
    ["2026-09-16T05:00:00Z"],
    "Pacific/Honolulu",
  );

  const result = await collector.collect("2026-09-15", ["claude-code"]);

  expect(result.sessions).toHaveLength(1);
});

test("TZ-4: rejects an invalid configured timezone", async () => {
  const collector = await collectorWithClaudeMessages(
    ["2026-09-16T05:00:00Z"],
    "Not/A-Timezone",
  );

  await expect(
    collector.collect("2026-09-16", ["claude-code"]),
  ).rejects.toThrow("Invalid local timezone: Not/A-Timezone");
});
