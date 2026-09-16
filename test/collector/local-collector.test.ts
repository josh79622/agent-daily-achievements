import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLocalCollector } from "../../src/collector/local-collector.js";

test("local collector returns same-day Claude Code and Codex sessions with issues", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-collector-"));
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
  context.after(() => rm(root, { force: true, recursive: true }));

  const collector = createLocalCollector({
    claudeDirectories: [claudeDirectory, join(root, "claude.jsonl")],
    codexDirectories: [codexDirectory, join(root, "codex.jsonl")],
  });
  const summary = await collector.collect("2026-09-16", [
    "claude-code",
    "codex",
  ]);

  assert.equal(summary.sources[0]?.sessions, 1);
  assert.equal(summary.sources[1]?.sessions, 1);
  assert.equal(summary.sources[0]?.issues, 1);
  assert.equal(summary.sessions[0]?.source, "claude-code");
  assert.equal(summary.sessions[0]?.messageCount, 2);
  assert.equal(summary.sessions[1]?.source, "codex");
  assert.equal(summary.sessions[1]?.messageCount, 1);
  assert.equal(summary.sessions[1]?.messages[0]?.text, "Build it");
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
    assert.deepEqual(
      result.sources.map(({ source }) => source),
      [selected],
    );
  });
}
