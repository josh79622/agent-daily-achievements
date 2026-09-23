import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import {
  createLocalCollector,
  projectFromCwd,
} from "../../src/collector/local-collector.js";

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

test("CC-7: keeps placeholders for non-text real-shape content blocks", async () => {
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
    "[tool_use Read {}]\nVisible synthetic reply\n[image]",
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

test("CC-11: ignores a fork context reference and retains the direct session", async () => {
  const { collector } = await claudeCollector([
    JSON.stringify({
      type: "fork-context-ref",
      parentSessionId: "synthetic-parent-session",
    }),
    claudeRecord("2026-09-16T09:00:00Z", "user", "Direct session work"),
  ]);

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.id).toBe("synthetic-claude-session");
  expect(result.sessions[0]?.messages.map(({ text }) => text)).toEqual([
    "Direct session work",
  ]);
});

test("CC-12: excludes agent and sidechain records that only have a parent session ID", async () => {
  const { collector } = await claudeCollector([
    JSON.stringify({
      type: "assistant",
      parentSessionId: "synthetic-parent-session",
      timestamp: "2026-09-16T09:00:00Z",
      uuid: "synthetic-sidechain-message",
      message: { role: "assistant", content: "Synthetic sidechain work" },
    }),
  ]);

  const result = await collector.collect("2026-09-16", ["claude-code"]);

  expect(result.sessions).toEqual([]);
  expect(result.sources[0]?.issues).toBe(0);
});

test("CC-13: extracts project attribution across claude-code, codex, and antigravity", async () => {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-projects-"));
  directories.push(root);

  // 1. Claude Code with record.cwd
  const claudeCwdDir = join(root, "claude-cwd");
  await mkdir(claudeCwdDir);
  await writeFile(
    join(claudeCwdDir, "session-1.jsonl"),
    JSON.stringify({
      type: "user",
      sessionId: "claude-cwd-1",
      timestamp: "2026-09-16T09:00:00Z",
      cwd: "/Users/dev/Documents/project-alpha",
      message: { role: "user", content: "Work on alpha" },
    }),
  );

  // 2. Claude Code with attachment.snapshot.workingDirectory
  const claudeSnapDir = join(root, "claude-snap");
  await mkdir(claudeSnapDir);
  await writeFile(
    join(claudeSnapDir, "session-2.jsonl"),
    JSON.stringify({
      type: "user",
      sessionId: "claude-snap-1",
      timestamp: "2026-09-16T09:00:00Z",
      attachment: {
        snapshot: { workingDirectory: "/Users/dev/workspace/beta-service" },
      },
      message: { role: "user", content: "Work on beta" },
    }),
  );

  // 3. Claude Code path fallback .claude/projects/-Users-dev-Documents-Josh-JobHunt
  const claudePathDir = join(
    root,
    ".claude",
    "projects",
    "-Users-dev-Documents-Josh-JobHunt",
  );
  await mkdir(claudePathDir, { recursive: true });
  await writeFile(
    join(claudePathDir, "session-3.jsonl"),
    JSON.stringify({
      type: "user",
      sessionId: "claude-path-1",
      timestamp: "2026-09-16T09:00:00Z",
      message: { role: "user", content: "Work on jobhunt" },
    }),
  );

  // 4. Codex with payload.cwd
  const codexDir = join(root, "codex");
  await mkdir(codexDir);
  await writeFile(
    join(codexDir, "codex-1.jsonl"),
    [
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-09-16T08:59:00Z",
        payload: { id: "codex-meta-1", cwd: "/Users/dev/repos/gamma-tool" },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-09-16T09:00:00Z",
        payload: {
          role: "user",
          type: "message",
          content: [{ type: "input_text", text: "Work on gamma" }],
        },
      }),
    ].join("\n"),
  );

  // 5. Codex with payload.git.repository_url
  await writeFile(
    join(codexDir, "codex-2.jsonl"),
    [
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-09-16T08:59:00Z",
        payload: {
          id: "codex-meta-2",
          git: { repository_url: "https://github.com/org/delta-app.git" },
        },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-09-16T09:00:00Z",
        payload: {
          role: "user",
          type: "message",
          content: [{ type: "input_text", text: "Work on delta" }],
        },
      }),
    ].join("\n"),
  );

  // 6. Antigravity with tool_calls args.Cwd
  const agBrain = join(root, "brain");
  const agSessionLogs = join(agBrain, "ag-sess-1", ".system_generated", "logs");
  await mkdir(agSessionLogs, { recursive: true });
  await writeFile(
    join(agSessionLogs, "transcript.jsonl"),
    [
      JSON.stringify({
        step_index: 1,
        source: "USER_EXPLICIT",
        type: "USER_INPUT",
        status: "DONE",
        created_at: "2026-09-16T09:00:00Z",
        content: "<USER_REQUEST>Fix bug</USER_REQUEST>",
      }),
      JSON.stringify({
        step_index: 2,
        source: "MODEL",
        type: "PLANNER_RESPONSE",
        status: "DONE",
        created_at: "2026-09-16T09:01:00Z",
        content: "Fixing",
        tool_calls: [
          {
            name: "run_command",
            args: { Cwd: "/Users/dev/projects/epsilon-core" },
          },
        ],
      }),
    ].join("\n"),
  );

  const collector = createLocalCollector({
    claudeDirectories: [claudeCwdDir, claudeSnapDir, claudePathDir],
    codexDirectories: [codexDir],
    antigravityDirectories: [agBrain],
    timeZone: "UTC",
  });

  const result = await collector.collect("2026-09-16", [
    "claude-code",
    "codex",
    "antigravity",
  ]);

  const byId = new Map(result.sessions.map((s) => [s.id, s.project]));
  expect(byId.get("claude-cwd-1")).toBe("project-alpha");
  expect(byId.get("claude-snap-1")).toBe("beta-service");
  expect(byId.get("claude-path-1")).toBe("JobHunt");
  expect(byId.get("codex-meta-1")).toBe("gamma-tool");
  expect(byId.get("codex-meta-2")).toBe("delta-app");
  expect(byId.get("ag-sess-1")).toBe("epsilon-core");
});

test("CC-14: ignores generic scratchpad paths like xreview and resolves Claude temp paths to the enclosing project", async () => {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-scratchpad-"));
  directories.push(root);

  // 1. Real project directory created on disk whose realpath is turned into a Claude slug
  const realProjectDir = join(root, "my_real_project");
  await mkdir(realProjectDir);
  const realProjectPath = await realpath(realProjectDir);
  const realSlug = realProjectPath.replace(/[^a-zA-Z0-9]/g, "-");

  // 2. Direct unit tests of projectFromCwd
  // a) Temporary Claude scratchpad path where reconstructed directory exists on disk:
  expect(
    projectFromCwd(
      `/private/tmp/claude-501/${realSlug}/4ca4821e-8961-4ff3-a9ca-e8bafb161ed9/scratchpad/xreview`,
    ),
  ).toBe("my_real_project");

  // b) Temporary Claude scratchpad path where directory does not exist on disk, falling back to slug's last non-generic part:
  expect(
    projectFromCwd(
      "/private/tmp/claude-501/-Users-dev-Documents-Josh-JobHunt/4ca4821e-8961-4ff3-a9ca-e8bafb161ed9/scratchpad/xreview",
    ),
  ).toBe("JobHunt");

  // c) Nested generic scratchpad paths resolve to the enclosing real project folder:
  expect(
    projectFromCwd("/Users/dev/workspace/my-service/scratchpad/xreview"),
  ).toBe("my-service");

  // d) Generic temp/scratchpad directory names without a valid parent are ignored (return undefined):
  expect(projectFromCwd("/private/tmp/scratchpad/xreview")).toBeUndefined();
  expect(projectFromCwd("/tmp/xreview")).toBeUndefined();
  expect(projectFromCwd("xreview")).toBeUndefined();

  // 3. Integration with createLocalCollector collecting Codex & Claude sessions with scratchpad cwd
  const codexDir = join(root, "codex");
  await mkdir(codexDir);
  await writeFile(
    join(codexDir, "codex-xreview.jsonl"),
    [
      JSON.stringify({
        type: "session_meta",
        timestamp: "2026-09-16T08:59:00Z",
        payload: {
          id: "codex-xreview-1",
          cwd: "/private/tmp/claude-501/-Users-dev-Documents-Josh-JobHunt/4ca4821e-8961-4ff3-a9ca-e8bafb161ed9/scratchpad/xreview",
        },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-09-16T09:00:00Z",
        payload: {
          role: "user",
          type: "message",
          content: [{ type: "input_text", text: "Review changes" }],
        },
      }),
    ].join("\n"),
  );

  const claudeDir = join(root, "claude");
  await mkdir(claudeDir);
  await writeFile(
    join(claudeDir, "claude-xreview.jsonl"),
    JSON.stringify({
      type: "user",
      sessionId: "claude-xreview-1",
      timestamp: "2026-09-16T09:00:00Z",
      cwd: `/private/tmp/claude-501/${realSlug}/uuid-123/scratchpad/xreview`,
      message: { role: "user", content: "Run xreview" },
    }),
  );

  const collector = createLocalCollector({
    claudeDirectories: [claudeDir],
    codexDirectories: [codexDir],
    timeZone: "UTC",
  });

  const result = await collector.collect("2026-09-16", [
    "claude-code",
    "codex",
  ]);

  const byId = new Map(result.sessions.map((s) => [s.id, s.project]));
  expect(byId.get("codex-xreview-1")).toBe("JobHunt");
  expect(byId.get("codex-xreview-1")).not.toBe("xreview");
  expect(byId.get("claude-xreview-1")).toBe("my_real_project");
  expect(byId.get("claude-xreview-1")).not.toBe("xreview");
});
