import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("local collector returns same-day Claude Code and Codex sessions with issues", async () => {
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
  expect(summary.sessions[1]?.messageCount).toBe(1);
  expect(summary.sessions[1]?.messages[0]?.text).toBe("Build it");
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
