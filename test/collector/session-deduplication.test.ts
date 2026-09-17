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

function claudeMessage(
  sessionId: string,
  id: string,
  timestamp: string,
  text: string,
): string {
  return JSON.stringify({
    type: "user",
    sessionId,
    timestamp,
    uuid: id,
    message: { role: "user", content: text },
  });
}

function codexFile(sessionId: string, timestamp: string, text: string): string[] {
  return [
    JSON.stringify({
      type: "session_meta",
      timestamp: "2026-09-16T08:59:00Z",
      payload: { id: sessionId },
    }),
    JSON.stringify({
      type: "response_item",
      timestamp,
      payload: {
        role: "user",
        type: "message",
        content: [{ type: "input_text", text }],
      },
    }),
  ];
}

async function collectorWithFiles(
  claudeFiles: string[][],
  codexFiles: string[][],
) {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-dedup-"));
  directories.push(root);
  const claudeDirectory = join(root, "claude");
  const codexDirectory = join(root, "codex");
  await mkdir(claudeDirectory);
  await mkdir(codexDirectory);
  await Promise.all(
    claudeFiles.map((lines, index) =>
      writeFile(join(claudeDirectory, `claude-${index}.jsonl`), lines.join("\n")),
    ),
  );
  await Promise.all(
    codexFiles.map((lines, index) =>
      writeFile(join(codexDirectory, `codex-${index}.jsonl`), lines.join("\n")),
    ),
  );
  return createLocalCollector({
    claudeDirectories: [claudeDirectory],
    codexDirectories: [codexDirectory],
    timeZone: "UTC",
  });
}

test("DD-1: merges exact duplicate records from repeated session files", async () => {
  const record = claudeMessage(
    "repeated-session",
    "same-message",
    "2026-09-16T09:00:00Z",
    "Repeated work",
  );
  const collector = await collectorWithFiles([[record], [record]], []);

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.messageCount).toBe(1);
  expect(result.sessions[0]?.messages.map(({ id }) => id)).toEqual([
    "same-message",
  ]);
});

test("DD-2: merges distinct records from files for the same session", async () => {
  const collector = await collectorWithFiles(
    [
      [
        claudeMessage(
          "split-session",
          "first-message",
          "2026-09-16T09:00:00Z",
          "First work",
        ),
      ],
      [
        claudeMessage(
          "split-session",
          "second-message",
          "2026-09-16T09:01:00Z",
          "Second work",
        ),
      ],
    ],
    [],
  );

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.messages.map(({ id }) => id)).toEqual([
    "first-message",
    "second-message",
  ]);
});

test("DD-3: marks conflicting duplicate message IDs as incomplete", async () => {
  const collector = await collectorWithFiles(
    [
      [
        claudeMessage(
          "conflict-session",
          "conflicting-message",
          "2026-09-16T09:00:00Z",
          "Original work",
        ),
      ],
      [
        claudeMessage(
          "conflict-session",
          "conflicting-message",
          "2026-09-16T09:01:00Z",
          "Changed work",
        ),
      ],
    ],
    [],
  );

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions).toEqual([]);
  expect(result.sources[0]).toMatchObject({
    state: "incomplete",
    reason: "duplicate-conflict",
    issues: 1,
  });
});

test("DD-4: retains different sessions whose message text happens to match", async () => {
  const collector = await collectorWithFiles(
    [
      [
        claudeMessage(
          "first-session",
          "first-message",
          "2026-09-16T09:00:00Z",
          "Same text",
        ),
      ],
      [
        claudeMessage(
          "second-session",
          "second-message",
          "2026-09-16T09:00:00Z",
          "Same text",
        ),
      ],
    ],
    [],
  );

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions.map(({ id }) => id).sort()).toEqual([
    "first-session",
    "second-session",
  ]);
});

test("DD-5: keeps merged context through the report day", async () => {
  const collector = await collectorWithFiles(
    [
      [
        claudeMessage(
          "cross-day-session",
          "day-one",
          "2026-09-01T09:00:00Z",
          "Day one",
        ),
      ],
      [
        claudeMessage(
          "cross-day-session",
          "day-two",
          "2026-09-02T09:00:00Z",
          "Day two",
        ),
      ],
    ],
    [],
  );

  const result = await collector.collect("2026-09-02", ["claude-code"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.messages.map(({ id }) => id)).toEqual([
    "day-one",
    "day-two",
  ]);
});

test("DD-6: keeps same session IDs separate across Claude Code and Codex", async () => {
  const collector = await collectorWithFiles(
    [
      [
        claudeMessage(
          "shared-id",
          "claude-message",
          "2026-09-16T09:00:00Z",
          "Claude work",
        ),
      ],
    ],
    [codexFile("shared-id", "2026-09-16T09:01:00Z", "Codex work")],
  );

  const result = await collector.collect("2026-09-16", [
    "claude-code",
    "codex",
  ]);

  expect(result.sessions.map(({ source }) => source).sort()).toEqual([
    "claude-code",
    "codex",
  ]);
});
