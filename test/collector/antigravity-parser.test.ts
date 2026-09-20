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

function userStep(
  step: number,
  timestamp: string,
  content: string,
  wrapped = true,
): string {
  const text = wrapped
    ? `<USER_REQUEST>\n${content}\n</USER_REQUEST>`
    : content;
  return JSON.stringify({
    step_index: step,
    source: "USER_EXPLICIT",
    type: "USER_INPUT",
    status: "DONE",
    created_at: timestamp,
    content: text,
  });
}

function plannerStep(
  step: number,
  timestamp: string,
  options: {
    content?: string;
    thinking?: string;
    tool_calls?: Array<{ name: string; args: Record<string, unknown> }>;
  },
): string {
  return JSON.stringify({
    step_index: step,
    source: "MODEL",
    type: "PLANNER_RESPONSE",
    status: "DONE",
    created_at: timestamp,
    ...options,
  });
}

function genericStep(
  step: number,
  timestamp: string,
  content: string,
  status = "DONE",
): string {
  return JSON.stringify({
    step_index: step,
    source: "MODEL",
    type: "GENERIC",
    status,
    created_at: timestamp,
    content,
  });
}

function systemStep(step: number, timestamp: string, content: string): string {
  return JSON.stringify({
    step_index: step,
    source: "SYSTEM",
    type: "SYSTEM_MESSAGE",
    status: "DONE",
    created_at: timestamp,
    content,
  });
}

async function antigravityCollector(
  sessions: Record<string, readonly string[]>,
  extraFiles?: Record<string, string>,
) {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-antigravity-"));
  directories.push(root);
  const brain = join(root, "brain");
  await mkdir(brain);

  for (const [sessionId, lines] of Object.entries(sessions)) {
    const sessionLogsDir = join(brain, sessionId, ".system_generated", "logs");
    await mkdir(sessionLogsDir, { recursive: true });
    await writeFile(join(sessionLogsDir, "transcript.jsonl"), lines.join("\n"));
  }

  if (extraFiles) {
    for (const [relPath, content] of Object.entries(extraFiles)) {
      const fullPath = join(brain, relPath);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, content);
    }
  }

  return {
    collector: createLocalCollector({
      claudeDirectories: [],
      codexDirectories: [],
      antigravityDirectories: [brain],
      timeZone: "UTC",
    }),
    brainDirectory: brain,
  };
}

test("AG-1: reads session from brain/<sessionId>/.system_generated/logs/transcript.jsonl", async () => {
  const { collector } = await antigravityCollector({
    "conv-uuid-1": [
      userStep(0, "2026-09-18T10:00:00Z", "Hello Antigravity"),
      plannerStep(1, "2026-09-18T10:01:00Z", { content: "Hello developer" }),
    ],
  });

  const result = await collector.collect("2026-09-18", ["antigravity"]);

  expect(result.sessions).toHaveLength(1);
  const session = result.sessions[0]!;
  expect(session.id).toBe("conv-uuid-1");
  expect(session.source).toBe("antigravity");
  expect(session.messages).toHaveLength(2);
  expect(session.messages[0]).toMatchObject({
    id: "step-0",
    role: "user",
    text: "Hello Antigravity",
  });
  expect(session.messages[1]).toMatchObject({
    id: "step-1",
    role: "assistant",
    text: "Hello developer",
  });
});

test("AG-2: unwraps <USER_REQUEST> tags from user inputs", async () => {
  const { collector } = await antigravityCollector({
    "conv-uuid-2": [
      userStep(0, "2026-09-18T08:00:00Z", "Clean up test database", true),
      plannerStep(1, "2026-09-18T08:01:00Z", { content: "Database cleaned" }),
    ],
  });

  const result = await collector.collect("2026-09-18", ["antigravity"]);

  expect(result.sessions[0]?.messages[0]?.text).toBe("Clean up test database");
});

test("AG-3: parses tool calls and tool results into structured parts", async () => {
  const { collector } = await antigravityCollector({
    "conv-uuid-tools": [
      userStep(0, "2026-09-18T12:00:00Z", "Run tests"),
      plannerStep(1, "2026-09-18T12:00:05Z", {
        tool_calls: [
          { name: "run_command", args: { CommandLine: "npm test" } },
        ],
      }),
      genericStep(2, "2026-09-18T12:00:10Z", "All tests passed!"),
      plannerStep(3, "2026-09-18T12:00:15Z", { content: "Tests are green." }),
    ],
  });

  const result = await collector.collect("2026-09-18", ["antigravity"]);

  const messages = result.sessions[0]?.messages;
  expect(messages).toHaveLength(4);
  expect(messages?.[1]?.parts).toEqual([
    {
      kind: "tool_use",
      text: '[tool_use run_command {"CommandLine":"npm test"}]',
    },
  ]);
  expect(messages?.[2]?.parts).toEqual([
    {
      kind: "tool_result",
      text: "[tool_result ok]\nAll tests passed!",
    },
  ]);
  expect(messages?.[3]?.parts).toEqual([
    {
      kind: "text",
      text: "Tests are green.",
    },
  ]);
});

test("AG-4: thinking deliberation is excluded without reporting an issue", async () => {
  const { collector } = await antigravityCollector({
    "conv-uuid-deliberation": [
      userStep(0, "2026-09-18T09:00:00Z", "Plan refactoring"),
      plannerStep(1, "2026-09-18T09:00:02Z", {
        thinking: "Let me think deeply about the modules...",
      }),
      plannerStep(2, "2026-09-18T09:00:05Z", {
        thinking: "More internal thoughts",
        content: "Here is the refactoring strategy.",
      }),
    ],
  });

  const result = await collector.collect("2026-09-18", ["antigravity"]);

  expect(result.sources[0]).toMatchObject({
    state: "available",
    issues: 0,
  });
  const messages = result.sessions[0]?.messages;
  expect(messages).toHaveLength(2);
  expect(messages?.[0]?.text).toBe("Plan refactoring");
  expect(messages?.[1]?.text).toBe("Here is the refactoring strategy.");
});

test("AG-5: system messages are excluded", async () => {
  const { collector } = await antigravityCollector({
    "conv-uuid-system": [
      userStep(0, "2026-09-18T09:00:00Z", "Start task"),
      systemStep(
        1,
        "2026-09-18T09:00:01Z",
        "<SYSTEM_MESSAGE> Background task completed",
      ),
      plannerStep(2, "2026-09-18T09:00:05Z", { content: "Done" }),
    ],
  });

  const result = await collector.collect("2026-09-18", ["antigravity"]);

  const messages = result.sessions[0]?.messages;
  expect(messages).toHaveLength(2);
  expect(messages?.[0]?.id).toBe("step-0");
  expect(messages?.[1]?.id).toBe("step-2");
});

test("AG-6: chunks and transcript_full.jsonl are ignored", async () => {
  const { collector } = await antigravityCollector(
    {
      "conv-uuid-unique": [
        userStep(0, "2026-09-18T10:00:00Z", "Message in transcript"),
      ],
    },
    {
      "conv-uuid-unique/.system_generated/logs/transcript_full.jsonl": userStep(
        0,
        "2026-09-18T10:00:00Z",
        "Duplicate full message",
      ),
      "conv-uuid-unique/.system_generated/logs/chunks/transcript/00000000.jsonl":
        userStep(0, "2026-09-18T10:00:00Z", "Duplicate chunk message"),
    },
  );

  const result = await collector.collect("2026-09-18", ["antigravity"]);

  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]?.messages).toHaveLength(1);
  expect(result.sources[0]?.issues).toBe(0);
});
