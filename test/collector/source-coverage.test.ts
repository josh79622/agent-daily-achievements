import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

function claudeMessage(text: string): string {
  return JSON.stringify({
    type: "user",
    sessionId: "coverage-session",
    timestamp: "2026-09-16T09:00:00Z",
    uuid: "coverage-message",
    message: { role: "user", content: text },
  });
}

async function sourceDirectory(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-coverage-"));
  directories.push(root);
  const directory = join(root, name);
  await mkdir(directory);
  return directory;
}

test("IC-1: reports an absent selected source as not installed", async () => {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-coverage-"));
  directories.push(root);
  const collector = createLocalCollector({
    claudeDirectories: [join(root, "missing")],
    codexDirectories: [],
    timeZone: "UTC",
  });

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sources[0]).toMatchObject({
    source: "claude-code",
    state: "not-installed",
    sessions: 0,
    issues: 0,
  });
});

test("IC-2: reports an unreadable selected source as incomplete", async () => {
  const directory = await sourceDirectory("claude");
  const file = join(directory, "session.jsonl");
  await writeFile(file, claudeMessage("Unreadable"));
  await chmod(file, 0o000);
  const collector = createLocalCollector({
    claudeDirectories: [file],
    codexDirectories: [],
    timeZone: "UTC",
  });

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sources[0]).toMatchObject({
    source: "claude-code",
    state: "incomplete",
    reason: "unreadable",
    sessions: 0,
    issues: 1,
  });
});

test("IC-3: reports a readable but unsupported source shape as incomplete", async () => {
  const directory = await sourceDirectory("claude");
  await writeFile(
    join(directory, "session.jsonl"),
    JSON.stringify({ type: "future-record", timestamp: "2026-09-16T09:00:00Z" }),
  );
  const collector = createLocalCollector({
    claudeDirectories: [directory],
    codexDirectories: [],
    timeZone: "UTC",
  });

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sources[0]).toMatchObject({
    source: "claude-code",
    state: "incomplete",
    reason: "unsupported-format",
    sessions: 0,
  });
});

test("IC-4: reports a partial final write while keeping readable activity", async () => {
  const directory = await sourceDirectory("claude");
  await writeFile(
    join(directory, "session.jsonl"),
    [claudeMessage("Readable"), "{partial-write"].join("\n"),
  );
  const collector = createLocalCollector({
    claudeDirectories: [directory],
    codexDirectories: [],
    timeZone: "UTC",
  });

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sources[0]).toMatchObject({
    source: "claude-code",
    state: "incomplete",
    reason: "partial-write",
    sessions: 1,
    issues: 1,
  });
  expect(result.sessions).toHaveLength(1);
});

test("IC-5: reports an accessible source with no report-day activity", async () => {
  const directory = await sourceDirectory("claude");
  const collector = createLocalCollector({
    claudeDirectories: [directory],
    codexDirectories: [],
    timeZone: "UTC",
  });

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sources[0]).toMatchObject({
    source: "claude-code",
    state: "no-activity",
    sessions: 0,
    issues: 0,
  });
});

test("IC-6: preserves an available source when another selected source is incomplete", async () => {
  const claudeDirectory = await sourceDirectory("claude");
  const root = await mkdtemp(join(tmpdir(), "daily-proof-coverage-"));
  directories.push(root);
  await writeFile(join(claudeDirectory, "session.jsonl"), claudeMessage("Available"));
  const collector = createLocalCollector({
    claudeDirectories: [claudeDirectory],
    codexDirectories: [join(root, "missing-codex")],
    timeZone: "UTC",
  });

  const result = await collector.collect("2026-09-16", [
    "claude-code",
    "codex",
  ]);

  expect(result.sources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: "claude-code",
        state: "available",
        sessions: 1,
      }),
      expect.objectContaining({
        source: "codex",
        state: "not-installed",
        sessions: 0,
      }),
    ]),
  );
  expect(result.sessions).toHaveLength(1);
});
