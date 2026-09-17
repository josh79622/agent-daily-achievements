import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLocalCollector } from "../../src/collector/local-collector.js";

async function collectorWithClaudeMessages(
  context: test.TestContext,
  timestamps: string[],
  timeZone?: string,
) {
  const directory = await mkdtemp(join(tmpdir(), "daily-proof-timezone-"));
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
  context.after(() => rm(directory, { force: true, recursive: true }));
  return createLocalCollector({
    claudeDirectories: [directory],
    codexDirectories: [],
    ...(timeZone ? { timeZone } : {}),
  } as Parameters<typeof createLocalCollector>[0]);
}

function computerDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

test("TZ-1: uses the computer's current timezone when none is configured", async (context) => {
  const timestamp = "2026-09-16T00:30:00Z";
  const collector = await collectorWithClaudeMessages(context, [timestamp]);

  const result = await collector.collect(computerDate(timestamp), ["claude-code"]);

  assert.equal(result.sessions.length, 1);
});

test("TZ-2: separates messages on opposite sides of midnight in the selected timezone", async (context) => {
  const collector = await collectorWithClaudeMessages(
    context,
    ["2026-09-16T06:59:59Z", "2026-09-16T07:00:00Z"],
    "America/Los_Angeles",
  );

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0]?.messageCount, 1);
  assert.equal(result.sessions[0]?.messages[0]?.timestamp, "2026-09-16T07:00:00Z");
});

test("TZ-3: classifies a UTC timestamp by a non-Sydney timezone", async (context) => {
  const collector = await collectorWithClaudeMessages(
    context,
    ["2026-09-16T05:00:00Z"],
    "Pacific/Honolulu",
  );

  const result = await collector.collect("2026-09-15", ["claude-code"]);

  assert.equal(result.sessions.length, 1);
});

test("TZ-4: rejects an invalid configured timezone", async (context) => {
  const collector = await collectorWithClaudeMessages(
    context,
    ["2026-09-16T05:00:00Z"],
    "Not/A-Timezone",
  );

  await assert.rejects(
    collector.collect("2026-09-16", ["claude-code"]),
    /Invalid local timezone: Not\/A-Timezone/,
  );
});
