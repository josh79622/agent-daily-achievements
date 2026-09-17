import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
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

function sessionMeta(id: string): string {
  return JSON.stringify({
    type: "session_meta",
    timestamp: "2026-09-16T08:59:00Z",
    payload: { id },
  });
}

function codexMessage(
  timestamp: string | undefined,
  role: "user" | "assistant",
  text: string,
  contentType: "input_text" | "output_text" =
    role === "user" ? "input_text" : "output_text",
): string {
  return JSON.stringify({
    type: "response_item",
    ...(timestamp ? { timestamp } : {}),
    payload: {
      role,
      type: "message",
      content: [{ type: contentType, text }],
    },
  });
}

async function codexCollector(
  activeFiles: string[][],
  archivedFiles: string[][] = [],
) {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-codex-shape-"));
  directories.push(root);
  const activeDirectory = join(root, "active");
  const archivedDirectory = join(root, "archived");
  await mkdir(activeDirectory);
  await mkdir(archivedDirectory);
  await Promise.all(
    activeFiles.map((lines, index) =>
      writeFile(join(activeDirectory, `active-${index}.jsonl`), lines.join("\n")),
    ),
  );
  await Promise.all(
    archivedFiles.map((lines, index) =>
      writeFile(
        join(archivedDirectory, `archived-${index}.jsonl`),
        lines.join("\n"),
      ),
    ),
  );
  return {
    collector: createLocalCollector({
      claudeDirectories: [],
      codexDirectories: [activeDirectory, archivedDirectory],
      timeZone: "UTC",
    }),
    activeDirectory,
  };
}

test("CD-1: reads session metadata and observed Codex message records", async () => {
  const { collector } = await codexCollector([
    [
      sessionMeta("synthetic-codex-session"),
      codexMessage("2026-09-16T09:00:00Z", "user", "Synthetic input"),
      codexMessage(
        "2026-09-16T09:01:00Z",
        "assistant",
        "Synthetic output",
      ),
      codexMessage("2026-09-17T09:00:00Z", "user", "Future input"),
    ],
  ]);

  const result = await collector.collect("2026-09-16", ["codex"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.id).toBe("synthetic-codex-session");
  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Synthetic input",
    "Synthetic output",
  ]);
});

test("CD-2: extracts input_text and output_text while ignoring non-text response items", async () => {
  const { collector } = await codexCollector([
    [
      sessionMeta("synthetic-codex-session"),
      codexMessage("2026-09-16T09:00:00Z", "user", "Input"),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-09-16T09:00:01Z",
        payload: {
          role: "assistant",
          type: "reasoning",
          content: [{ type: "reasoning", summary: [] }],
        },
      }),
      codexMessage("2026-09-16T09:00:02Z", "assistant", "Output"),
    ],
  ]);

  const result = await collector.collect("2026-09-16", ["codex"]);

  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Input",
    "Output",
  ]);
});

test("CD-3: ignores observed Codex metadata event types", async () => {
  const { collector } = await codexCollector([
    [
      sessionMeta("synthetic-codex-session"),
      ...[
        "turn_context",
        "event_msg",
        "compacted",
        "world_state",
        "token_usage_record",
        "inter_agent_communication_metadata",
      ].map((type) =>
        JSON.stringify({ type, timestamp: "2026-09-16T09:00:00Z", payload: {} }),
      ),
      codexMessage("2026-09-16T09:00:01Z", "user", "Conversation only"),
    ],
  ]);

  const result = await collector.collect("2026-09-16", ["codex"]);

  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Conversation only",
  ]);
});

test("CD-4: reports missing and invalid timestamps without failing the source", async () => {
  const { collector } = await codexCollector([
    [
      sessionMeta("synthetic-codex-session"),
      codexMessage(undefined, "user", "Missing timestamp"),
      codexMessage("invalid-timestamp", "assistant", "Invalid timestamp"),
      codexMessage("2026-09-16T09:00:00Z", "user", "Readable"),
    ],
  ]);

  const result = await collector.collect("2026-09-16", ["codex"]);

  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Readable",
  ]);
  expect(result.sources[0]?.issues).toBe(2);
});

test("CD-5: retains readable messages and reports a malformed JSONL line", async () => {
  const { collector } = await codexCollector([
    [
      sessionMeta("synthetic-codex-session"),
      codexMessage("2026-09-16T09:00:00Z", "user", "Readable"),
      "{truncated",
    ],
  ]);

  const result = await collector.collect("2026-09-16", ["codex"]);

  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Readable",
  ]);
  expect(result.sources[0]?.issues).toBe(1);
});

test("CD-6: retains session context through the report day", async () => {
  const { collector } = await codexCollector([
    [
      sessionMeta("synthetic-codex-session"),
      codexMessage("2026-09-01T09:00:00Z", "user", "Day one"),
      codexMessage("2026-09-02T09:00:00Z", "assistant", "Day two"),
      codexMessage("2026-09-03T09:00:00Z", "user", "Day three"),
    ],
  ]);

  const result = await collector.collect("2026-09-02", ["codex"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Day one",
    "Day two",
  ]);
});

for (const [placement, activeFiles, archivedFiles] of [
  [
    "two active files",
    [
      [sessionMeta("duplicate-session"), codexMessage("2026-09-16T09:00:00Z", "user", "First")],
      [sessionMeta("duplicate-session"), codexMessage("2026-09-16T09:01:00Z", "assistant", "Second")],
    ],
    [],
  ],
  [
    "an active and an archived file",
    [[sessionMeta("duplicate-session"), codexMessage("2026-09-16T09:00:00Z", "user", "Active")]],
    [[sessionMeta("duplicate-session"), codexMessage("2026-09-16T09:01:00Z", "assistant", "Archived")]],
  ],
] as const) {
  test(`CD-7: excludes a duplicate session ID across ${placement}`, async () => {
    const { collector } = await codexCollector(activeFiles, archivedFiles);

    const result = await collector.collect("2026-09-16", ["codex"]);

    expect(result.sessions).toEqual([]);
    expect(result.sources[0]?.issues).toBe(1);
  });
}

test("CD-8: retains distinct active and archived sessions once each", async () => {
  const { collector } = await codexCollector(
    [[sessionMeta("active-session"), codexMessage("2026-09-16T09:00:00Z", "user", "Active")]],
    [[sessionMeta("archived-session"), codexMessage("2026-09-16T09:01:00Z", "assistant", "Archived")]],
  );

  const result = await collector.collect("2026-09-16", ["codex"]);

  expect(result.sessions.map(({ id }) => id).sort()).toEqual([
    "active-session",
    "archived-session",
  ]);
});

test("CD-9: reads a Codex source without changing it or exposing malformed text", async () => {
  const secret = "SYNTHETIC_PRIVATE_MALFORMED_CODEX_TEXT";
  const { collector, activeDirectory } = await codexCollector([
    [
      sessionMeta("synthetic-codex-session"),
      codexMessage("2026-09-16T09:00:00Z", "user", "Readable"),
      `{"private":"${secret}"`,
    ],
  ]);
  const file = join(activeDirectory, "active-0.jsonl");
  await chmod(file, 0o444);
  const before = await stat(file);

  const result = await collector.collect("2026-09-16", ["codex"]);
  const after = await stat(file);

  expect(after.mtimeMs).toBe(before.mtimeMs);
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(result.sources[0]?.issues).toBe(1);
});
