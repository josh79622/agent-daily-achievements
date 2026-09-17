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

function claudeRecord(
  timestamp: string | undefined,
  role: "user" | "assistant",
  content: unknown,
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    type: role,
    sessionId: "synthetic-claude-session",
    ...(timestamp ? { timestamp } : {}),
    uuid: `synthetic-${role}-${timestamp ?? "missing"}`,
    message: { role, content },
    ...overrides,
  });
}

async function claudeCollector(
  lines: string[],
  timeZone = "UTC",
  fileName = "session.jsonl",
) {
  const directory = await mkdtemp(join(tmpdir(), "daily-proof-claude-shape-"));
  directories.push(directory);
  const sessions = join(directory, "sessions");
  await mkdir(sessions);
  const file = join(sessions, fileName);
  await writeFile(file, lines.join("\n"));
  return {
    collector: createLocalCollector({
      claudeDirectories: [directory],
      codexDirectories: [],
      timeZone,
    }),
    file,
  };
}

test("local collector returns report-day sessions with their earlier context and issues", async () => {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-collector-"));
  directories.push(root);
  const claudeDirectory = join(root, "claude");
  const codexDirectory = join(root, "codex");
  await writeFile(join(root, "placeholder"), "");
  await writeFile(
    join(root, "claude.jsonl"),
    [
      JSON.stringify({
        type: "user",
        sessionId: "claude-1",
        timestamp: "2026-09-16T02:00:00Z",
        uuid: "c1",
        message: { role: "user", content: "Plan the collector" },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "claude-1",
        timestamp: "2026-09-16T02:01:00Z",
        uuid: "c2",
        message: { role: "assistant", content: "I can help." },
      }),
      JSON.stringify({ type: "system", timestamp: "2026-09-16T02:02:00Z" }),
      "{bad-json",
    ].join("\n"),
  );
  await writeFile(
    join(root, "codex.jsonl"),
    [
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-09-16T02:00:00Z",
        payload: { id: "codex-1" },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-09-16T04:00:00Z",
        payload: {
          role: "user",
          type: "message",
          content: [{ type: "input_text", text: "Build it" }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-09-15T04:00:00Z",
        payload: {
          role: "assistant",
          type: "message",
          content: [{ type: "output_text", text: "Old message" }],
        },
      }),
    ].join("\n"),
  );

  const collector = createLocalCollector({
    claudeDirectories: [claudeDirectory, join(root, "claude.jsonl")],
    codexDirectories: [codexDirectory, join(root, "codex.jsonl")],
  });
  const summary = await collector.collect("2026-09-16", [
    "claude-code",
    "codex",
  ]);

  expect(summary.sources[0]?.sessions).toBe(1);
  expect(summary.sources[1]?.sessions).toBe(1);
  expect(summary.sources[0]?.issues).toBe(1);
  expect(summary.sessions[0]?.source).toBe("claude-code");
  expect(summary.sessions[0]?.messageCount).toBe(2);
  expect(summary.sessions[1]?.source).toBe("codex");
  expect(summary.sessions[1]?.messageCount).toBe(2);
  expect(summary.sessions[1]?.messages.map(({ text }) => text)).toEqual([
    "Old message",
    "Build it",
  ]);
});

for (const selected of ["claude-code", "codex"] as const) {
  test(`local collector never accesses unselected directories when selecting ${selected}`, async () => {
    const options =
      selected === "codex"
        ? {
            codexDirectories: [],
            get claudeDirectories(): string[] {
              throw new Error("Unauthorized directory access");
            },
          }
        : {
            claudeDirectories: [],
            get codexDirectories(): string[] {
              throw new Error("Unauthorized directory access");
            },
          };
    const result = await createLocalCollector(options).collect("2026-09-16", [
      selected,
    ]);
    expect(result.sources.map(({ source }) => source)).toEqual([selected]);
  });
}

test("CC-1: reads real-shape user and assistant records through the report day", async () => {
  const { collector } = await claudeCollector([
    claudeRecord("2026-09-16T09:00:00Z", "user", [
      { type: "text", text: "Synthetic user text" },
    ]),
    claudeRecord("2026-09-16T09:01:00Z", "assistant", "Synthetic reply"),
    claudeRecord("2026-09-17T09:00:00Z", "user", "Future synthetic text"),
  ]);

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.messages.map(({ role }) => role)).toEqual([
    "user",
    "assistant",
  ]);
  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Synthetic user text",
    "Synthetic reply",
  ]);
});

test("CC-2: keeps one Claude session identity and chronological message order", async () => {
  const { collector } = await claudeCollector([
    claudeRecord("2026-09-16T09:02:00Z", "assistant", "Second"),
    claudeRecord("2026-09-16T09:01:00Z", "user", "First"),
  ]);

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.id).toBe("synthetic-claude-session");
  expect(result.sessions[0]?.messageCount).toBe(2);
  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "First",
    "Second",
  ]);
});

test("CC-3: ignores real-shape non-conversation events", async () => {
  const { collector } = await claudeCollector([
    JSON.stringify({
      type: "queue-operation",
      sessionId: "synthetic-claude-session",
      timestamp: "2026-09-16T09:00:00Z",
    }),
    JSON.stringify({
      type: "file-history-snapshot",
      sessionId: "synthetic-claude-session",
      timestamp: "2026-09-16T09:00:01Z",
    }),
    claudeRecord("2026-09-16T09:00:02Z", "user", "Only conversation"),
  ]);

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Only conversation",
  ]);
});

test("CC-4: retains valid messages and reports a malformed record", async () => {
  const { collector } = await claudeCollector([
    claudeRecord("2026-09-16T09:00:00Z", "user", "Readable"),
    "{truncated",
  ]);

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Readable",
  ]);
  expect(result.sources[0]?.issues).toBe(1);
});

test("CC-5: reports valid JSON records that have missing or invalid timestamps", async () => {
  const { collector } = await claudeCollector([
    claudeRecord(undefined, "user", "Missing timestamp"),
    claudeRecord("not-a-timestamp", "assistant", "Invalid timestamp"),
    claudeRecord("2026-09-16T09:00:00Z", "user", "Readable"),
  ]);

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Readable",
  ]);
  expect(result.sources[0]?.issues).toBe(2);
});

test("CC-6: includes prior context only for a session active on the report day", async () => {
  const { collector } = await claudeCollector([
    claudeRecord("2026-09-01T09:00:00Z", "user", "Day one"),
    claudeRecord("2026-09-02T09:00:00Z", "assistant", "Day two"),
    claudeRecord("2026-09-03T09:00:00Z", "user", "Day three"),
  ]);

  const result = await collector.collect("2026-09-02", ["claude-code"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Day one",
    "Day two",
  ]);
  expect(result.sessions[0]?.startedAt).toBe("2026-09-01T09:00:00Z");
  expect(result.sessions[0]?.endedAt).toBe("2026-09-02T09:00:00Z");
});

test("CC-7: extracts text blocks while ignoring non-text real-shape content blocks", async () => {
  const { collector } = await claudeCollector([
    claudeRecord("2026-09-16T09:00:00Z", "assistant", [
      { type: "thinking", thinking: "Synthetic reasoning", signature: "x" },
      { type: "tool_use", id: "tool-1", name: "Read", input: {} },
      { type: "text", text: "Visible synthetic reply" },
      { type: "image", source: { type: "base64" } },
    ]),
  ]);

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Visible synthetic reply",
  ]);
});

test("CC-8: accepts a BOM and CRLF-terminated Claude JSONL file", async () => {
  const { collector } = await claudeCollector([
    `\uFEFF${claudeRecord("2026-09-16T09:00:00Z", "user", "BOM record")}\r`,
    `${claudeRecord("2026-09-16T09:01:00Z", "assistant", "CRLF record")}\r`,
  ]);
  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "BOM record",
    "CRLF record",
  ]);
  expect(result.sources[0]?.issues).toBe(0);
});

test("CC-9: aggregates multiple malformed records without mistaking them for no activity", async () => {
  const { collector } = await claudeCollector([
    claudeRecord("2026-09-16T09:00:00Z", "user", "Readable"),
    "{bad-one",
    "{bad-two",
  ]);

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sources[0]?.issues).toBe(2);
});

test("CC-10: reads a source without changing it or exposing malformed source text", async () => {
  const secret = "SYNTHETIC_PRIVATE_MALFORMED_SOURCE_TEXT";
  const { collector, file } = await claudeCollector([
    claudeRecord("2026-09-16T09:00:00Z", "user", "Readable"),
    `{"private":"${secret}"`,
  ]);
  await chmod(file, 0o444);
  const before = await stat(file);

  const result = await collector.collect("2026-09-16", ["claude-code"]);
  const after = await stat(file);

  expect(after.mtimeMs).toBe(before.mtimeMs);
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(result.sources[0]?.issues).toBe(1);
});
