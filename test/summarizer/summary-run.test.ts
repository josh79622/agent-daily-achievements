import { expect, test } from "vitest";

import type { AchievementReportV1 } from "../../src/report/contract.js";
import type { SummaryRequest } from "../../src/server/app.js";
import {
  createSummaryRunner,
  parseCandidateJson,
  summaryTransportMaxReplyBytes,
} from "../../src/summarizer/summary-run.js";
import type {
  ProbeRunRequest,
  ProbeRunResult,
  ReplyFileResult,
} from "../../src/summarizer/readiness-probe.js";
import { buildSummaryRequestText } from "../../src/report/summary-prompt.js";

// Test cases SR-1 to SR-11 from docs/plans/2026-09-18-summary-run-design.md.
// Every process, temp-dir, reply-file, and store dependency is a fake; no
// real CLI is ever invoked by this file.

function claudeExit(reply: string): ProbeRunResult {
  return {
    kind: "exited",
    exitCode: 0,
    stdout: JSON.stringify({ is_error: false, result: reply }),
    stdoutTooLarge: false,
  };
}

function agyExit(reply: string): ProbeRunResult {
  return {
    kind: "exited",
    exitCode: 0,
    stdout: JSON.stringify({ status: "SUCCESS", response: reply }),
    stdoutTooLarge: false,
  };
}

function candidate(count: number): string {
  return JSON.stringify({
    achievements: Array.from({ length: count }, (_, index) => ({
      id: `item-${index}`,
      category: "progress",
      title: `Item ${index}`,
      detail: "Detail",
      // Distinct message IDs per item: the same evidence set on two items is
      // a duplicate-achievement failure the contract deliberately rejects.
      evidence: [
        { source: "codex", recordId: "rec-1", messageIds: [`m${index}`] },
      ],
    })),
  });
}

interface Harness {
  runs: ProbeRunRequest[];
  created: number;
  removed: string[];
  saved: AchievementReportV1[];
  locateCalls: string[];
  models: Array<{ provider: string; model?: string; effort?: string }>;
}

function harness({
  provider = "claude-code",
  hasExecutable = true,
  runnerScript,
  effectiveSettings = {},
}: {
  provider?: "claude-code" | "codex" | "agy";
  hasExecutable?: boolean;
  runnerScript: Array<ProbeRunResult | "throw">;
  effectiveSettings?: { model?: string; effort?: string };
}) {
  const executablePath = hasExecutable ? "/usr/bin/claude" : undefined;
  const state: Harness = {
    runs: [],
    created: 0,
    removed: [],
    saved: [],
    locateCalls: [],
    models: [],
  };
  let index = 0;
  const runner = createSummaryRunner({
    locate: async (p) => {
      state.locateCalls.push(p);
      return executablePath;
    },
    models: {
      async view() {
        return [];
      },
      async effectiveSettings(p) {
        state.models.push({ provider: p, ...effectiveSettings });
        return effectiveSettings;
      },
      async save() {
        return undefined;
      },
      async saveEffort() {
        return undefined;
      },
    },
    runner: async (request) => {
      state.runs.push(request);
      const step = runnerScript[index] ?? runnerScript.at(-1);
      index += 1;
      if (step === undefined)
        throw new Error("Test bug: runnerScript is empty.");
      if (step === "throw") throw new Error("could not start");
      return step;
    },
    tempDirs: {
      async create() {
        state.created += 1;
        return `/tmp/summary-run-${state.created}`;
      },
      async remove(directory) {
        state.removed.push(directory);
      },
    },
    readReplyFile: async (): Promise<ReplyFileResult> => {
      // Only exercised on the codex path, which this file's tests don't take.
      return { kind: "missing" };
    },
    reportStore: {
      async save(report) {
        state.saved.push(report);
      },
    },
  });
  return { runner, state, provider };
}

function request(): SummaryRequest {
  return {
    scheduled: false,
    payload: {
      date: "2026-09-18",
      timeZone: "Australia/Sydney",
      payloadJson: '{"date":"2026-09-18","conversations":[]}',
      manifest: [
        {
          source: "codex",
          recordId: "rec-1",
          messageIds: ["m0", "m1", "m2", "m3", "m4", "m5"],
        },
      ],
      coverage: [{ source: "codex", state: "included" }],
      byteLength: 41,
    },
  };
}

function chunkedRequest(): SummaryRequest {
  const conversations = ["rec-1", "rec-2"].map((recordId, index) => ({
    source: "codex" as const,
    recordId,
    messages: [
      {
        id: `m${index}`,
        role: "user",
        time: "09:00",
        text: "x".repeat(70_000),
      },
    ],
  }));
  const payloadJson = JSON.stringify({ date: "2026-09-18", conversations });
  return {
    scheduled: false,
    payload: {
      date: "2026-09-18",
      timeZone: "Australia/Sydney",
      payloadJson,
      manifest: conversations.map((conversation) => ({
        source: conversation.source,
        recordId: conversation.recordId,
        messageIds: conversation.messages.map((message) => message.id),
      })),
      coverage: [{ source: "codex", state: "included" }],
      byteLength: Buffer.byteLength(payloadJson),
    },
  };
}

function multiSessionChunkedRequest(): SummaryRequest {
  const conversations = ["rec-1", "rec-2", "rec-3"].map((recordId, index) => ({
    source: "codex" as const,
    recordId,
    messages: [
      {
        id: `m${index}`,
        role: "user",
        time: "09:00",
        text: "x".repeat(50_000),
      },
    ],
  }));
  const payloadJson = JSON.stringify({ date: "2026-09-18", conversations });
  return {
    scheduled: false,
    payload: {
      date: "2026-09-18",
      timeZone: "Australia/Sydney",
      payloadJson,
      manifest: conversations.map((conversation) => ({
        source: conversation.source,
        recordId: conversation.recordId,
        messageIds: conversation.messages.map((message) => message.id),
      })),
      coverage: [{ source: "codex", state: "included" }],
      byteLength: Buffer.byteLength(payloadJson),
    },
  };
}

function candidateFor(recordId: string, messageId?: string): string {
  return JSON.stringify({
    achievements: [
      {
        id: `item-${recordId}`,
        category: "progress",
        title: "Item",
        detail: "Detail",
        evidence: [
          messageId
            ? { source: "codex", recordId, messageIds: [messageId] }
            : { source: "codex", recordId },
        ],
      },
    ],
  });
}

test("SR-1: a valid reply at 0, 1, and 5 achievements is saved and resolves", async () => {
  for (const count of [0, 1, 5]) {
    const { runner, state } = harness({
      runnerScript: [claudeExit(candidate(count))],
    });
    await runner.run("claude-code", request());
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0]!.status).toBe("complete");
    expect(state.saved[0]!.achievements).toHaveLength(count);
  }
});

test("SR-2: a Markdown-fenced reply parses the same as bare JSON", () => {
  const bare = candidate(1);
  expect(parseCandidateJson(bare)).toEqual(JSON.parse(bare));
  expect(parseCandidateJson("```json\n" + bare + "\n```")).toEqual(
    JSON.parse(bare),
  );
  expect(parseCandidateJson("```\n" + bare + "\n```")).toEqual(
    JSON.parse(bare),
  );
});

test("SR-3: unparseable JSON retries three times, saves incomplete, and throws for provider fallback", async () => {
  const { runner, state } = harness({
    runnerScript: [claudeExit("not json at all")],
  });
  await expect(runner.run("claude-code", request())).rejects.toThrow();
  expect(state.runs).toHaveLength(3);
  expect(state.saved).toHaveLength(1);
  expect(state.saved[0]!.status).toBe("incomplete");
  expect(state.saved[0]!.incomplete).toEqual([
    { reason: "summary-invalid", issue: "invalid-shape" },
  ]);
});

test("SR-4: too-many-achievements retries with the identical request text, then accepts", async () => {
  const { runner, state } = harness({
    runnerScript: [claudeExit(candidate(6)), claudeExit(candidate(2))],
  });
  await runner.run("claude-code", request());
  expect(state.runs).toHaveLength(2);
  expect(state.runs[0]!.args).toEqual(state.runs[1]!.args);
  expect(state.saved).toHaveLength(1);
  expect(state.saved[0]!.status).toBe("complete");
  expect(state.saved[0]!.achievements).toHaveLength(2);
});

test("SR-5: too-many-achievements on all three attempts saves incomplete and throws", async () => {
  const { runner, state } = harness({
    runnerScript: [claudeExit(candidate(6))],
  });
  await expect(runner.run("claude-code", request())).rejects.toThrow();
  expect(state.runs).toHaveLength(3);
  expect(state.saved).toHaveLength(1);
  expect(state.saved[0]!.incomplete).toEqual([
    { reason: "summary-invalid", issue: "too-many-achievements" },
  ]);
});

test("SR-6: unknown evidence retries exactly three times before provider fallback", async () => {
  const badEvidence = JSON.stringify({
    achievements: [
      {
        id: "item-0",
        category: "progress",
        title: "Item",
        detail: "Detail",
        evidence: [
          { source: "codex", recordId: "unknown-record", messageIds: ["m1"] },
        ],
      },
    ],
  });
  const { runner, state } = harness({
    runnerScript: [claudeExit(badEvidence)],
  });
  await expect(runner.run("claude-code", request())).rejects.toThrow();
  expect(state.runs).toHaveLength(3);
  expect(state.saved[0]!.incomplete).toEqual([
    { reason: "summary-invalid", issue: "unknown-evidence" },
  ]);
});

test("SR-6a: an overlong detail retries exactly three times before provider fallback", async () => {
  const invalidDetail = JSON.stringify({
    achievements: [
      {
        id: "item-0",
        category: "progress",
        title: "Item",
        detail: "x".repeat(501),
        evidence: [{ source: "codex", recordId: "rec-1", messageIds: ["m0"] }],
      },
    ],
  });
  const { runner, state } = harness({
    runnerScript: [claudeExit(invalidDetail)],
  });

  await expect(runner.run("claude-code", request())).rejects.toThrow();

  expect(state.runs).toHaveLength(3);
  expect(state.saved[0]!.incomplete).toEqual([
    { reason: "summary-invalid", issue: "invalid-achievement" },
  ]);
});

test("SR-7: no executable located saves unavailable and throws", async () => {
  const { runner, state } = harness({
    hasExecutable: false,
    runnerScript: [],
  });
  await expect(runner.run("claude-code", request())).rejects.toThrow();
  expect(state.runs).toHaveLength(0);
  expect(state.saved).toHaveLength(1);
  expect(state.saved[0]!.incomplete).toEqual([
    { reason: "summary-unavailable" },
  ]);
});

test("SR-8: unavailable or over-cap replies end unavailable without saving content", async () => {
  const scripts: Array<ProbeRunResult | "throw"> = [
    "throw",
    { kind: "timed-out" },
    { kind: "exited", exitCode: 1, stdout: "", stdoutTooLarge: false },
    claudeExit(""),
    {
      kind: "exited",
      exitCode: 0,
      stdout: JSON.stringify({ is_error: false, result: candidate(1) }),
      stdoutTooLarge: true,
    },
  ];
  for (const script of scripts) {
    const { runner, state } = harness({ runnerScript: [script] });
    await expect(runner.run("claude-code", request())).rejects.toThrow();
    // All three attempts are spent before giving up, matching the retry
    // limit's own three-attempt count.
    expect(state.runs).toHaveLength(3);
    expect(state.saved[0]!.incomplete).toEqual([
      { reason: "summary-unavailable" },
    ]);
  }
});

test("SR-9: the model and effort passed match effectiveSettings, omitted when undefined", async () => {
  const withSettings = harness({
    effectiveSettings: { model: "opus", effort: "high" },
    runnerScript: [claudeExit(candidate(0))],
  });
  await withSettings.runner.run("claude-code", request());
  expect(withSettings.state.runs[0]!.args).toEqual(
    expect.arrayContaining(["--model", "opus", "--effort", "high"]),
  );

  const withoutSettings = harness({
    effectiveSettings: {},
    runnerScript: [claudeExit(candidate(0))],
  });
  await withoutSettings.runner.run("claude-code", request());
  expect(withoutSettings.state.runs[0]!.args).not.toContain("--model");
  expect(withoutSettings.state.runs[0]!.args).not.toContain("--effort");
});

test("SR-10: each attempt gets a fresh temp directory, removed after that attempt", async () => {
  const { runner, state } = harness({
    runnerScript: [claudeExit(candidate(6)), claudeExit(candidate(1))],
  });
  await runner.run("claude-code", request());
  expect(state.created).toBe(2);
  expect(state.removed).toEqual(["/tmp/summary-run-1", "/tmp/summary-run-2"]);
});

test("SR-11: pre-existing coverage incompleteness is preserved alongside a summary issue", async () => {
  const { runner, state } = harness({ runnerScript: [claudeExit("bad")] });
  const requestWithIncompleteSource = request();
  requestWithIncompleteSource.payload.coverage = [
    { source: "codex", state: "incomplete", reason: "collection-failed" },
  ];
  await expect(
    runner.run("claude-code", requestWithIncompleteSource),
  ).rejects.toThrow();
  expect(state.saved[0]!.coverage).toEqual([
    { source: "codex", state: "incomplete", reason: "collection-failed" },
  ]);
  expect(state.saved[0]!.incomplete).toEqual(
    expect.arrayContaining([
      { reason: "source-incomplete", source: "codex" },
      { reason: "summary-invalid", issue: "invalid-shape" },
    ]),
  );
});

test("CH-5: two valid chunk summaries produce exactly one final merge", async () => {
  const { runner, state } = harness({
    runnerScript: [
      claudeExit(candidateFor("rec-1", "m0")),
      claudeExit(candidateFor("rec-2", "m1")),
      claudeExit(
        JSON.stringify({
          achievements: [
            {
              id: "merged",
              category: "progress",
              title: "Merged",
              detail: "Detail",
              evidence: [
                { source: "codex", recordId: "rec-1", messageIds: ["m0"] },
                { source: "codex", recordId: "rec-2", messageIds: ["m1"] },
              ],
            },
          ],
        }),
      ),
    ],
  });

  await runner.run("claude-code", chunkedRequest());

  expect(state.runs).toHaveLength(3);
  expect(state.runs[2]!.args.join(" ")).toContain(
    "compact candidate achievements",
  );
  expect(state.saved).toHaveLength(1);
  expect(state.saved[0]!.status).toBe("complete");
  expect(state.saved[0]!.achievements[0]!.id).toBe("merged");
});

test("CH-6: invalid chunk evidence retries then accepts before merging", async () => {
  const { runner, state } = harness({
    runnerScript: [
      claudeExit(candidateFor("wrong", "m0")),
      claudeExit(candidateFor("rec-1", "m0")),
      claudeExit(candidateFor("rec-2", "m1")),
      claudeExit(candidateFor("rec-1")),
    ],
  });

  await runner.run("claude-code", chunkedRequest());

  expect(state.runs).toHaveLength(4);
  expect(state.runs[0]!.args).toEqual(state.runs[1]!.args);
  expect(state.saved[0]!.status).toBe("complete");
});

test("CH-7: a failed chunk stops before merge, saves a safe failure, and throws", async () => {
  const { runner, state } = harness({
    runnerScript: [claudeExit("bad")],
  });

  await expect(runner.run("claude-code", chunkedRequest())).rejects.toThrow();

  expect(state.runs).toHaveLength(3);
  expect(state.saved[0]!.incomplete).toEqual([
    {
      reason: "summary-chunk-failed",
      chunkIndex: 0,
      issue: "invalid-shape",
      sessions: [{ source: "codex", recordId: "rec-1" }],
    },
  ]);
});

test("CH-7a: a failed multi-session chunk saves only affected source and session identities", async () => {
  const { runner, state } = harness({
    runnerScript: [claudeExit("bad")],
  });

  await expect(
    runner.run("claude-code", multiSessionChunkedRequest()),
  ).rejects.toThrow();

  expect(state.saved[0]!.incomplete).toEqual([
    {
      reason: "summary-chunk-failed",
      chunkIndex: 0,
      issue: "invalid-shape",
      sessions: [
        { source: "codex", recordId: "rec-1" },
        { source: "codex", recordId: "rec-2" },
      ],
    },
  ]);
  expect(JSON.stringify(state.saved[0]!.incomplete)).not.toContain(
    "x".repeat(50),
  );
});

test("CH-8: merge retries invalid output then saves its valid later reply", async () => {
  const { runner, state } = harness({
    runnerScript: [
      claudeExit(candidateFor("rec-1", "m0")),
      claudeExit(candidateFor("rec-2", "m1")),
      claudeExit("bad"),
      claudeExit(candidateFor("rec-1")),
    ],
  });

  await runner.run("claude-code", chunkedRequest());

  expect(state.runs).toHaveLength(4);
  expect(state.runs[2]!.args).toEqual(state.runs[3]!.args);
  expect(state.saved[0]!.status).toBe("complete");
});

test("CH-8b: merge rejects full-day evidence absent from compact candidates before saving", async () => {
  const day = chunkedRequest();
  const conversations = ["rec-1", "rec-2", "rec-3"].map((recordId, index) => ({
    source: "codex" as const,
    recordId,
    messages: [
      {
        id: `m${index}`,
        role: "user",
        time: "09:00",
        text: "x".repeat(70_000),
      },
    ],
  }));
  day.payload.payloadJson = JSON.stringify({
    date: day.payload.date,
    conversations,
  });
  day.payload.manifest = conversations.map((conversation) => ({
    source: conversation.source,
    recordId: conversation.recordId,
    messageIds: conversation.messages.map((message) => message.id),
  }));
  day.payload.byteLength = Buffer.byteLength(day.payload.payloadJson);
  const { runner, state } = harness({
    runnerScript: [
      claudeExit(candidateFor("rec-1", "m0")),
      claudeExit(candidateFor("rec-2", "m1")),
      claudeExit(JSON.stringify({ achievements: [] })),
      claudeExit(candidateFor("rec-3", "m2")),
      claudeExit(candidateFor("rec-1", "m0")),
    ],
  });

  await runner.run("claude-code", day);

  expect(state.runs).toHaveLength(5);
  expect(state.runs[3]!.args).toEqual(state.runs[4]!.args);
  expect(state.saved[0]!.status).toBe("complete");
  expect(state.saved[0]!.achievements[0]!.evidence).toEqual([
    { source: "codex", recordId: "rec-1", messageIds: ["m0"] },
  ]);
});

test("CH-8a: unavailable merge retries three times, saves typed incomplete, and throws", async () => {
  const { runner, state } = harness({
    runnerScript: [
      claudeExit(candidateFor("rec-1", "m0")),
      claudeExit(candidateFor("rec-2", "m1")),
      "throw",
    ],
  });

  await expect(runner.run("claude-code", chunkedRequest())).rejects.toThrow();

  expect(state.runs).toHaveLength(5);
  expect(state.saved[0]!.incomplete).toEqual([
    { reason: "summary-merge-unavailable" },
  ]);
});

test("CH-9: message-level evidence collapses to session-level before one merge when necessary", async () => {
  const messageIds = Array.from(
    { length: 96 },
    (_, index) => `message-${index}-${"x".repeat(700)}`,
  );
  const conversations = ["rec-1", "rec-2"].map((recordId) => ({
    source: "codex" as const,
    recordId,
    messages: messageIds.map((id, index) => ({
      id,
      role: "user",
      time: "09:00",
      text: index === 0 ? "x".repeat(40_000) : "",
    })),
  }));
  const payloadJson = JSON.stringify({ date: "2026-09-18", conversations });
  const oversized: SummaryRequest = {
    scheduled: false,
    payload: {
      date: "2026-09-18",
      timeZone: "Australia/Sydney",
      payloadJson,
      manifest: conversations.map((conversation) => ({
        source: conversation.source,
        recordId: conversation.recordId,
        messageIds,
      })),
      coverage: [{ source: "codex", state: "included" }],
      byteLength: Buffer.byteLength(payloadJson),
    },
  };
  const multiEvidenceCandidate = (recordId: string) =>
    JSON.stringify({
      achievements: [
        {
          id: `item-${recordId}`,
          category: "progress",
          title: "Item",
          detail: "Detail",
          evidence: [{ source: "codex", recordId, messageIds }],
        },
      ],
    });
  const { runner, state } = harness({
    runnerScript: [
      claudeExit(multiEvidenceCandidate("rec-1")),
      claudeExit(multiEvidenceCandidate("rec-2")),
      claudeExit(candidateFor("rec-1")),
    ],
  });

  await runner.run("claude-code", oversized);

  const mergeInput = state.runs[2]!.args.join(" ");
  expect(mergeInput).toContain('"recordId":"rec-1"');
  expect(mergeInput).not.toContain('"recordId":"rec-1","messageIds"');
});

test("CH-10: an exact merge prompt over budget saves incomplete without a merge CLI call", async () => {
  const conversations = Array.from({ length: 200 }, (_, index) => ({
    source: "codex" as const,
    recordId: `rec-${index}`,
    messages: [
      {
        id: `m-${index}`,
        role: "user",
        time: "09:00",
        text: "x".repeat(70_000),
      },
    ],
  }));
  const payloadJson = JSON.stringify({ date: "2026-09-18", conversations });
  const largeRequest: SummaryRequest = {
    scheduled: false,
    payload: {
      date: "2026-09-18",
      timeZone: "Australia/Sydney",
      payloadJson,
      manifest: conversations.map((conversation) => ({
        source: conversation.source,
        recordId: conversation.recordId,
        messageIds: conversation.messages.map((message) => message.id),
      })),
      coverage: [{ source: "codex", state: "included" }],
      byteLength: Buffer.byteLength(payloadJson),
    },
  };
  const verboseCandidate = (recordId: string, messageId: string) =>
    JSON.stringify({
      achievements: [
        {
          id: `item-${recordId}`,
          category: "progress",
          title: "T".repeat(120),
          detail: "D".repeat(500),
          evidence: [{ source: "codex", recordId, messageIds: [messageId] }],
        },
      ],
    });
  const { runner, state } = harness({
    runnerScript: conversations.map((conversation) =>
      claudeExit(
        verboseCandidate(conversation.recordId, conversation.messages[0]!.id),
      ),
    ),
  });

  await runner.run("claude-code", largeRequest);

  expect(state.runs).toHaveLength(200);
  expect(state.saved[0]!.incomplete).toEqual([
    { reason: "summary-merge-too-large" },
  ]);
});

test("summary runner accepts a valid reply over 8 KiB within its 512 KiB transport cap", async () => {
  const req = request();
  const messageIds = Array.from({ length: 300 }, (_, index) => `m-${index}`);
  const evidenceHeavyRequest: SummaryRequest = {
    ...req,
    payload: {
      ...req.payload,
      manifest: [{ source: "codex", recordId: "rec-1", messageIds }],
    },
  };
  const oversizedChunkReply = JSON.stringify({
    achievements: [
      {
        id: "evidence-heavy",
        category: "progress",
        title: "Evidence-heavy summary",
        detail: "A valid structured summary with every supplied message cited.",
        evidence: messageIds.map((messageId) => ({
          source: "codex",
          recordId: "rec-1",
          messageIds: [messageId],
        })),
      },
    ],
  });
  expect(Buffer.byteLength(oversizedChunkReply)).toBeGreaterThan(8 * 1024);
  const { runner, state } = harness({
    runnerScript: [claudeExit(oversizedChunkReply)],
  });

  await runner.run("claude-code", evidenceHeavyRequest);

  expect(summaryTransportMaxReplyBytes).toBe(512 * 1024);
  expect(state.runs[0]?.maxStdoutBytes).toBe(summaryTransportMaxReplyBytes);
  expect(state.saved[0]?.status).toBe("complete");
});

test("summary runner treats a reply over the transport cap as unavailable", async () => {
  const transportOverflow = "x".repeat(summaryTransportMaxReplyBytes + 1);
  const tooLarge: ProbeRunResult = {
    kind: "exited",
    exitCode: 0,
    stdout: transportOverflow,
    stdoutTooLarge: true,
  };
  const { runner, state } = harness({
    runnerScript: [tooLarge],
  });

  await expect(runner.run("claude-code", request())).rejects.toThrow();

  expect(Buffer.byteLength(transportOverflow)).toBeGreaterThan(
    summaryTransportMaxReplyBytes,
  );
  expect(state.runs).toHaveLength(3);
  expect(state.runs.every((run) => run.maxStdoutBytes === 512 * 1024)).toBe(
    true,
  );
  expect(state.saved[0]?.incomplete).toEqual([
    { reason: "summary-unavailable" },
  ]);
});

test("SR: agy invokes agy CLI without -p and pipes prompt to stdin", async () => {
  const { runner, state } = harness({
    provider: "agy",
    runnerScript: [agyExit(candidate(3))],
  });
  const req = request();
  await runner.run("agy", req);
  expect(state.runs).toHaveLength(1);
  expect(state.runs[0]?.captureStdout).toBe(true);
  expect(state.runs[0]?.args).not.toContain("-p");
  expect(state.runs[0]?.args).toContain("--output-format");
  expect(state.runs[0]?.stdin).toBe(
    buildSummaryRequestText(req.payload.payloadJson),
  );
  expect(state.saved).toHaveLength(1);
  expect(state.saved[0]?.status).toBe("complete");
  expect(state.saved[0]?.achievements).toHaveLength(3);
});
