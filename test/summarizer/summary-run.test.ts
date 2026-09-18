import { expect, test } from "vitest";

import type { AchievementReportV1 } from "../../src/report/contract.js";
import type { SummaryRequest } from "../../src/server/app.js";
import {
  createSummaryRunner,
  parseCandidateJson,
  summaryMaxReplyBytes,
} from "../../src/summarizer/summary-run.js";
import type {
  ProbeRunRequest,
  ProbeRunResult,
  ReplyFileResult,
} from "../../src/summarizer/readiness-probe.js";

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

test("SR-3: unparseable JSON is saved incomplete and run() resolves", async () => {
  const { runner, state } = harness({
    runnerScript: [claudeExit("not json at all")],
  });
  await runner.run("claude-code", request());
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

test("SR-6: any other invalid issue is not retried and run() resolves", async () => {
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
  await runner.run("claude-code", request());
  expect(state.runs).toHaveLength(1);
  expect(state.saved[0]!.incomplete).toEqual([
    { reason: "summary-invalid", issue: "unknown-evidence" },
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

test("SR-8: could-not-start, timed out, non-zero exit, and an empty reply all end unavailable", async () => {
  const scripts: Array<ProbeRunResult | "throw"> = [
    "throw",
    { kind: "timed-out" },
    { kind: "exited", exitCode: 1, stdout: "", stdoutTooLarge: false },
    claudeExit(""),
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
  await runner.run("claude-code", requestWithIncompleteSource);
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

// Reply-cap size is not exercised via the injected readReplyFile fake above;
// this only checks the exported constant is what SR-8's expectations rely on.
test("summaryMaxReplyBytes is exported for the process runner's stdout cap", () => {
  expect(summaryMaxReplyBytes).toBeGreaterThan(0);
});

test("SR: agy invokes agy CLI with -p and saves the candidate report", async () => {
  const { runner, state } = harness({
    provider: "agy",
    runnerScript: [agyExit(candidate(3))],
  });
  await runner.run("agy", request());
  expect(state.runs).toHaveLength(1);
  expect(state.runs[0]?.captureStdout).toBe(true);
  expect(state.runs[0]?.args).toContain("-p");
  expect(state.runs[0]?.args).toContain("--output-format");
  expect(state.saved).toHaveLength(1);
  expect(state.saved[0]?.status).toBe("complete");
  expect(state.saved[0]?.achievements).toHaveLength(3);
});
