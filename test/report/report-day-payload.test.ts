import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import {
  createLocalCollector,
  type CollectedMessage,
  type CollectedSession,
  type CollectionSummary,
  type LocalCollector,
  type LocalSource,
  type SourceCoverage,
} from "../../src/collector/local-collector.js";
import { validateSummaryCandidate } from "../../src/report/contract.js";
import {
  buildReportDayPayload,
  toolPartCap,
} from "../../src/report/report-day-payload.js";

// Task PB in docs/plans/2026-09-18-report-day-payload-design.md. All records are
// synthetic and nothing is transmitted.

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

function message(
  id: string,
  text: string,
  { minute = "12", role = "user" as CollectedMessage["role"] } = {},
): CollectedMessage {
  return {
    id,
    role,
    text,
    timestamp: `2026-09-18T09:${minute}:00Z`,
    parts: [{ kind: "text", text }],
  };
}

function session(
  id: string,
  source: LocalSource,
  messages: CollectedMessage[],
): CollectedSession {
  return {
    id,
    source,
    file: `/synthetic/${id}.jsonl`,
    startedAt: messages[0]?.timestamp ?? "2026-09-18T09:00:00Z",
    endedAt: messages.at(-1)?.timestamp ?? "2026-09-18T09:00:00Z",
    messageCount: messages.length,
    issueCount: 0,
    messages,
  };
}

function fakeCollector(
  summary: Partial<CollectionSummary> & {
    sessions: CollectedSession[];
    overBroad?: boolean;
  },
  calls: Array<readonly LocalSource[]> = [],
): LocalCollector {
  return {
    async collect(date, sources) {
      calls.push([...sources]);
      const observed = new Set(
        summary.sessions.map((entry) => entry.source as LocalSource),
      );
      return {
        date,
        timeZone: summary.timeZone ?? "UTC",
        sources:
          summary.sources ??
          [...observed].map((source) => ({
            source,
            sessions: 1,
            issues: 0,
            state: "available" as const,
          })),
        sessions: summary.overBroad
          ? summary.sessions
          : summary.sessions.filter((entry) => sources.includes(entry.source)),
      };
    },
  };
}

const oneSession = [
  session("session-a", "codex", [
    message("m-1", "decide the format"),
    message("m-2", "option A", { minute: "13", role: "assistant" }),
  ]),
];

test("PB-1: builds the approved shape with no coverage, version or timezone inside", async () => {
  const result = await buildReportDayPayload({
    collector: fakeCollector({ sessions: oneSession }),
    date: "2026-09-18",
    sourceScope: ["codex"],
  });

  expect(JSON.parse(result.payloadJson)).toEqual({
    date: "2026-09-18",
    conversations: [
      {
        source: "codex",
        recordId: "session-a",
        messages: [
          { id: "m-1", role: "user", time: "09:12", text: "decide the format" },
          {
            id: "m-2",
            role: "assistant",
            time: "09:13",
            text: "option A",
          },
        ],
      },
    ],
  });
  expect(result.payloadJson).not.toContain("\n");
  expect(result.byteLength).toBe(Buffer.byteLength(result.payloadJson));
});

test("PB-2: the manifest matches the payload and every message validates as evidence", async () => {
  const result = await buildReportDayPayload({
    collector: fakeCollector({ sessions: oneSession }),
    date: "2026-09-18",
    sourceScope: ["codex"],
  });

  expect(result.manifest).toEqual([
    { source: "codex", recordId: "session-a", messageIds: ["m-1", "m-2"] },
  ]);
  const validation = validateSummaryCandidate(
    {
      achievements: [
        {
          id: "a-1",
          category: "decision",
          title: "Chose the payload format",
          detail: "Picked option A after comparing three formats.",
          evidence: [
            {
              source: "codex",
              recordId: "session-a",
              messageIds: ["m-1", "m-2"],
            },
          ],
        },
      ],
    },
    { manifest: result.manifest, coverage: result.coverage },
  );
  expect(validation).toMatchObject({ ok: true });
});

test("PB-3: an ID absent from the payload fails as unknown evidence", async () => {
  const result = await buildReportDayPayload({
    collector: fakeCollector({ sessions: oneSession }),
    date: "2026-09-18",
    sourceScope: ["codex"],
  });

  for (const evidence of [
    { source: "codex" as const, recordId: "session-b" },
    { source: "codex" as const, recordId: "session-a", messageIds: ["m-9"] },
  ])
    expect(
      validateSummaryCandidate(
        {
          achievements: [
            {
              id: "a-1",
              category: "progress",
              title: "Invented",
              detail: "Cites a record that was never sent.",
              evidence: [evidence],
            },
          ],
        },
        { manifest: result.manifest, coverage: result.coverage },
      ),
    ).toEqual({ ok: false, issue: "unknown-evidence", retryable: false });
});

test("PB-4: coverage is returned separately and never appears in the payload", async () => {
  const sources: SourceCoverage[] = [
    { source: "codex", sessions: 1, issues: 0, state: "available" },
    {
      source: "claude-code",
      sessions: 0,
      issues: 3,
      state: "incomplete",
      reason: "malformed-record",
    },
  ];
  const result = await buildReportDayPayload({
    collector: fakeCollector({ sessions: oneSession, sources }),
    date: "2026-09-18",
    sourceScope: ["codex", "claude-code"],
  });

  expect(result.coverage).toEqual([
    { source: "codex", state: "included" },
    { source: "claude-code", state: "incomplete", reason: "malformed-record" },
  ]);
  expect(result.payloadJson).not.toContain("coverage");
  expect(result.payloadJson).not.toContain("included");
});

test("PB-5: only sources inside the approved scope are collected and serialized", async () => {
  const calls: Array<readonly LocalSource[]> = [];
  const result = await buildReportDayPayload({
    // Deliberately over-broad: the builder must enforce the scope itself, so a
    // collector that returns more than it was asked for cannot widen what the
    // summarizer receives.
    collector: fakeCollector(
      {
        overBroad: true,
        sessions: [
          ...oneSession,
          session("session-c", "claude-code", [message("m-3", "other source")]),
        ],
      },
      calls,
    ),
    date: "2026-09-18",
    sourceScope: ["codex"],
  });

  expect(calls).toEqual([["codex"]]);
  expect(result.payloadJson).not.toContain("claude-code");
  expect(result.payloadJson).not.toContain("other source");
  expect(result.manifest.map(({ recordId }) => recordId)).toEqual([
    "session-a",
  ]);
});

test("PB-6: a session with no report-day activity is in neither payload nor manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-pb-day-"));
  roots.push(root);
  const directory = join(root, "claude");
  await mkdir(directory);
  const record = (uuid: string, day: string) =>
    JSON.stringify({
      type: "user",
      sessionId: `session-${uuid}`,
      timestamp: `${day}T09:00:00Z`,
      uuid,
      message: { role: "user", content: "synthetic" },
    });
  await writeFile(join(directory, "old.jsonl"), record("m-old", "2026-09-17"));
  await writeFile(
    join(directory, "today.jsonl"),
    record("m-new", "2026-09-18"),
  );

  const result = await buildReportDayPayload({
    collector: createLocalCollector({
      claudeDirectories: [directory],
      codexDirectories: [],
      timeZone: "UTC",
    }),
    date: "2026-09-18",
    sourceScope: ["claude-code"],
  });

  expect(result.manifest).toEqual([
    { source: "claude-code", recordId: "session-m-new", messageIds: ["m-new"] },
  ]);
  expect(result.payloadJson).not.toContain("m-old");
});

function toolMessage(id: string, body: string): CollectedMessage {
  const text = `[tool_result ok]\n${body}`;
  return {
    id,
    role: "user",
    text,
    timestamp: "2026-09-18T09:12:00Z",
    parts: [{ kind: "tool_result", text }],
  };
}

function toolUseMessage(id: string, body: string): CollectedMessage {
  const text = `[tool_use Write ${body}`;
  return {
    id,
    role: "assistant",
    text,
    timestamp: "2026-09-18T09:12:00Z",
    parts: [{ kind: "tool_use", text }],
  };
}

/**
 * The exact output a capped part must produce. The marker is always kept; one
 * window of `toolPartCap` body characters follows it for a tool_use (the head,
 * where the tool name and path are) or precedes it for a tool_result (the tail,
 * where a run's verdict is). Markers are written out literally here so a bug in
 * the implementation's marker matching cannot hide.
 */
function truncatedTo(
  marker: string,
  body: string,
  side: "head" | "tail",
): string {
  const omitted = `[\u2026 ${body.length - toolPartCap} characters omitted]`;
  return side === "head"
    ? `${marker}${body.slice(0, toolPartCap)}\n${omitted}`
    : `${marker}${omitted}\n${body.slice(body.length - toolPartCap)}`;
}

function sentText(payloadJson: string, index = 0): string {
  const payload = JSON.parse(payloadJson) as {
    conversations: Array<{ messages: Array<{ text: string }> }>;
  };
  return payload.conversations[0]?.messages[index]?.text ?? "";
}

async function buildWith(messages: CollectedMessage[]) {
  return buildReportDayPayload({
    collector: fakeCollector({
      sessions: [session("session-t", "codex", messages)],
    }),
    date: "2026-09-18",
    sourceScope: ["codex"],
  });
}

test("PB-7: a tool_result over the cap keeps its outcome marker and its tail", async () => {
  const body = "A".repeat(4000) + "VERDICT: 2 tests failed";
  const result = await buildWith([toolMessage("m-big", body)]);

  const text = sentText(result.payloadJson);
  expect(text).toBe(truncatedTo("[tool_result ok]\n", body, "tail"));
  // A run's verdict is at the end, so the tail is the window that matters.
  expect(text.endsWith("VERDICT: 2 tests failed")).toBe(true);
  expect(text.startsWith("[tool_result ok]")).toBe(true);
  expect(text.length).toBeLessThan(body.length);
});

test("PB-8: a tool part at or below twice the cap passes through unchanged", async () => {
  const body = "B".repeat(toolPartCap);
  const result = await buildWith([toolMessage("m-small", body)]);
  expect(sentText(result.payloadJson)).toBe(`[tool_result ok]\n${body}`);

  // Exactly at the boundary it is kept whole; one character more is truncated.
  const prefix = "[tool_result ok]\n".length;
  const exact = await buildWith([
    toolMessage("m-exact", "B".repeat(toolPartCap * 2 - prefix)),
  ]);
  expect(sentText(exact.payloadJson)).toHaveLength(toolPartCap * 2);
  expect(sentText(exact.payloadJson)).not.toContain("omitted");

  const over = await buildWith([
    toolMessage("m-over", "B".repeat(toolPartCap * 2 - prefix + 1)),
  ]);
  const text = sentText(over.payloadJson);
  expect(text).toContain("characters omitted");
  expect(text.length).toBeLessThan(toolPartCap * 2);
});

test("PB-9: a long conversation text part is not capped", async () => {
  const text = "C".repeat(toolPartCap * 4);
  const result = await buildWith([message("m-long", text)]);

  expect(sentText(result.payloadJson)).toBe(text);
});

test("PB-10: truncation is content-blind at equal length", async () => {
  const size = toolPartCap * 4;
  const first = await buildWith([toolMessage("m-1", "D".repeat(size))]);
  const second = await buildWith([toolMessage("m-1", "E".repeat(size))]);

  const [a, b] = [
    sentText(first.payloadJson),
    sentText(second.payloadJson),
  ] as const;
  expect(a.length).toBe(b.length);
  expect(a.replaceAll("D", "E")).toBe(b);
});

test("PB-11: the same input builds a byte-identical payload twice", async () => {
  const first = await buildReportDayPayload({
    collector: fakeCollector({ sessions: oneSession }),
    date: "2026-09-18",
    sourceScope: ["codex"],
  });
  const second = await buildReportDayPayload({
    collector: fakeCollector({ sessions: oneSession }),
    date: "2026-09-18",
    sourceScope: ["codex"],
  });

  expect(second.payloadJson).toBe(first.payloadJson);
  expect(second.manifest).toEqual(first.manifest);
});

test("PB-12: a day with no sessions yields empty conversations and an empty manifest", async () => {
  const result = await buildReportDayPayload({
    collector: fakeCollector({
      sessions: [],
      sources: [
        { source: "codex", sessions: 0, issues: 0, state: "no-activity" },
      ],
    }),
    date: "2026-09-18",
    sourceScope: ["codex"],
  });

  expect(JSON.parse(result.payloadJson)).toEqual({
    date: "2026-09-18",
    conversations: [],
  });
  expect(result.manifest).toEqual([]);
  expect(
    validateSummaryCandidate(
      {
        achievements: [
          {
            id: "a-1",
            category: "progress",
            title: "Nothing to cite",
            detail: "There is no record to support this.",
            evidence: [{ source: "codex", recordId: "session-a" }],
          },
        ],
      },
      { manifest: result.manifest, coverage: result.coverage },
    ),
  ).toMatchObject({ ok: false, issue: "unknown-evidence" });
});

test("PB-13: building transmits nothing and does not modify the source", async () => {
  const root = await mkdtemp(join(tmpdir(), "daily-proof-pb-readonly-"));
  roots.push(root);
  const directory = join(root, "claude");
  await mkdir(directory);
  const file = join(directory, "session.jsonl");
  const line = JSON.stringify({
    type: "user",
    sessionId: "readonly-session",
    timestamp: "2026-09-18T09:00:00Z",
    uuid: "m-1",
    message: { role: "user", content: "synthetic" },
  });
  await writeFile(file, line);

  await buildReportDayPayload({
    collector: createLocalCollector({
      claudeDirectories: [directory],
      codexDirectories: [],
      timeZone: "UTC",
    }),
    date: "2026-09-18",
    sourceScope: ["claude-code"],
  });

  expect(await readFile(file, "utf8")).toBe(line);
});

test("PB-14: a tool_use over the cap keeps its name, target and head", async () => {
  // Measured on real records: tool_use is 24.6% of a day's content, averaging
  // 1,134 bytes, because an Edit or Write carries whole file contents.
  const body = `{"file_path":"/x/y.ts","content":"${"A".repeat(4000)}"}]`;
  const result = await buildWith([toolUseMessage("m-big", body)]);

  const text = sentText(result.payloadJson);
  expect(text).toBe(truncatedTo("[tool_use Write ", body, "head"));
  // Which tool ran, and on what, is the highest-value part and must survive.
  expect(text.startsWith('[tool_use Write {"file_path":"/x/y.ts"')).toBe(true);
});

test("PB-15: a tool_use part at or below the cap passes through unchanged", async () => {
  const body = `{"file_path":"/x","content":"${"B".repeat(100)}"}]`;
  const result = await buildWith([toolUseMessage("m-small", body)]);

  expect(sentText(result.payloadJson)).toBe(`[tool_use Write ${body}`);
});

test("PB-16: only tool parts are capped; other kinds pass through at any length", async () => {
  const long = "C".repeat(toolPartCap * 4);
  const result = await buildReportDayPayload({
    collector: fakeCollector({
      sessions: [
        session("session-k", "codex", [
          {
            id: "m-kinds",
            role: "user",
            text: long,
            timestamp: "2026-09-18T09:12:00Z",
            parts: [
              { kind: "text", text: long },
              { kind: "image", text: long },
              { kind: "other", text: long },
            ],
          },
        ]),
      ],
    }),
    date: "2026-09-18",
    sourceScope: ["codex"],
  });

  expect(sentText(result.payloadJson)).toBe([long, long, long].join("\n"));
});

test("PB-17: identity survives truncation for both tool kinds", async () => {
  // The point of the asymmetry: dropping the head would lose the tool name, and
  // dropping a tool_result head would lose whether the run succeeded.
  const failing = `[tool_result error]\n${"E".repeat(4000)}`;
  const result = await buildReportDayPayload({
    collector: fakeCollector({
      sessions: [
        session("session-i", "codex", [
          {
            id: "m-1",
            role: "assistant",
            text: failing,
            timestamp: "2026-09-18T09:12:00Z",
            parts: [{ kind: "tool_result", text: failing }],
          },
          toolUseMessage(
            "m-2",
            `{"file_path":"/deep/path.ts","x":"${"D".repeat(4000)}"}]`,
          ),
        ]),
      ],
    }),
    date: "2026-09-18",
    sourceScope: ["codex"],
  });

  expect(sentText(result.payloadJson, 0)).toContain("[tool_result error]");
  expect(sentText(result.payloadJson, 1)).toContain("[tool_use Write");
  expect(sentText(result.payloadJson, 1)).toContain("/deep/path.ts");
});
