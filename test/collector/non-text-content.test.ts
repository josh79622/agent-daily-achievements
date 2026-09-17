import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import {
  createLocalCollector,
  type CollectedMessage,
} from "../../src/collector/local-collector.js";

// Task NT in docs/plans/2026-09-18-report-day-payload-design.md. Real Claude
// Code records contain thinking, tool_use, tool_result, text and image blocks
// (docs/research/2026-09-17-claude-code-parser-verification.md). These records
// are synthetic; no real conversation content is used.

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";

function record(
  content: unknown,
  { uuid = "m-1", minute = "00" }: { uuid?: string; minute?: string } = {},
): string {
  return JSON.stringify({
    type: "user",
    sessionId: "nt-session",
    timestamp: `2026-09-18T09:${minute}:00Z`,
    uuid,
    message: { role: "user", content },
  });
}

async function collect(lines: string[]) {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-nontext-"));
  roots.push(root);
  const directory = join(root, "claude");
  await mkdir(directory);
  await writeFile(join(directory, "nt-session.jsonl"), lines.join("\n"));
  const collector = createLocalCollector({
    claudeDirectories: [directory],
    codexDirectories: [],
    timeZone: "UTC",
  });
  const result = await collector.collect("2026-09-18", ["claude-code"]);
  return {
    coverage: result.sources[0],
    messages: result.sessions.flatMap((session) => session.messages),
  };
}

function only(messages: CollectedMessage[]): CollectedMessage {
  expect(messages).toHaveLength(1);
  return messages[0] as CollectedMessage;
}

test("NT-1: an image block becomes a media-type placeholder without image data", async () => {
  const { messages } = await collect([
    record([
      { type: "text", text: "here is the screenshot" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: base64Png },
      },
    ]),
  ]);

  const message = only(messages);
  expect(message.parts).toEqual([
    { kind: "text", text: "here is the screenshot" },
    { kind: "image", text: "[image image/png]" },
  ]);
  expect(JSON.stringify(message)).not.toContain(base64Png);
});

test("NT-2: a message whose only content is an image is kept", async () => {
  const { coverage, messages } = await collect([
    record([
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: base64Png },
      },
    ]),
  ]);

  expect(only(messages).text).toBe("[image image/png]");
  expect(coverage).toMatchObject({ state: "available", issues: 0 });
});

test("NT-3: a tool_use block keeps its name and input verbatim", async () => {
  const { messages } = await collect([
    record([
      {
        type: "tool_use",
        id: "tu_1",
        name: "Read",
        input: { file_path: "/tmp/a.png", limit: 20 },
      },
    ]),
  ]);

  expect(only(messages).parts).toEqual([
    {
      kind: "tool_use",
      text: '[tool_use Read {"file_path":"/tmp/a.png","limit":20}]',
    },
  ]);
});

test("NT-4: a tool_result block records its outcome and then its content", async () => {
  const { messages } = await collect([
    record(
      [{ type: "tool_result", tool_use_id: "tu_1", content: "line one" }],
      {
        uuid: "m-ok",
        minute: "00",
      },
    ),
    record(
      [
        {
          type: "tool_result",
          tool_use_id: "tu_2",
          is_error: true,
          content: [{ type: "text", text: "ENOENT: no such file" }],
        },
      ],
      { uuid: "m-err", minute: "01" },
    ),
  ]);

  expect(messages.map((message) => message.parts)).toEqual([
    [{ kind: "tool_result", text: "[tool_result ok]\nline one" }],
    [
      {
        kind: "tool_result",
        text: "[tool_result error]\nENOENT: no such file",
      },
    ],
  ]);
});

test("NT-5: deliberation blocks are excluded without reporting an issue", async () => {
  const { coverage, messages } = await collect([
    record([
      { type: "thinking", thinking: "internal deliberation" },
      { type: "text", text: "the decision is C" },
    ]),
    record([{ type: "thinking", thinking: "only deliberation" }], {
      uuid: "m-2",
      minute: "01",
    }),
    record([{ type: "reasoning", summary: [] }], {
      uuid: "m-3",
      minute: "02",
    }),
  ]);

  expect(only(messages).parts).toEqual([
    { kind: "text", text: "the decision is C" },
  ]);
  // A message holding only excluded deliberation is explained, not lost, so it
  // must not mark the day incomplete.
  expect(coverage).toMatchObject({ state: "available", issues: 0 });
});

test("NT-6: a message with no representable content counts as an issue", async () => {
  const { coverage, messages } = await collect([
    record([], { uuid: "m-empty", minute: "00" }),
    record([{ type: "text", text: "still here" }], {
      uuid: "m-kept",
      minute: "01",
    }),
  ]);

  expect(only(messages).text).toBe("still here");
  expect(coverage).toMatchObject({
    state: "incomplete",
    reason: "malformed-record",
    issues: 1,
  });
});

test("NT-7: an unrecognized block kind becomes a generic placeholder", async () => {
  const { coverage, messages } = await collect([
    record([{ type: "redacted_thinking", data: "opaque" }]),
  ]);

  expect(only(messages).parts).toEqual([
    { kind: "other", text: "[redacted_thinking]" },
  ]);
  expect(coverage).toMatchObject({ state: "available", issues: 0 });
});

test("NT-8: text stays the joined parts and report-day ordering is unchanged", async () => {
  const { messages } = await collect([
    record(
      [
        { type: "text", text: "run it" },
        { type: "tool_use", id: "tu_1", name: "Bash", input: { cmd: "ls" } },
      ],
      { uuid: "m-1", minute: "05" },
    ),
    record([{ type: "text", text: "second" }], {
      uuid: "m-2",
      minute: "09",
    }),
  ]);

  expect(messages.map((message) => message.id)).toEqual(["m-1", "m-2"]);
  for (const message of messages)
    expect(message.text).toBe(
      message.parts.map((part) => part.text).join("\n"),
    );
  expect(messages[0]?.text).toBe('run it\n[tool_use Bash {"cmd":"ls"}]');
});
