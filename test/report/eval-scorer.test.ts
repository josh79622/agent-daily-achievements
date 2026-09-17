import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
  assembleReport,
  type ReportCoverage,
  type SummaryOutcome,
} from "../../src/report/contract.js";
import {
  parseEvalSet,
  scoreReport,
  type EvalCase,
} from "../../src/report/eval-scorer.js";

const fixture: unknown = JSON.parse(
  readFileSync("test/fixtures/report-eval/synthetic-set-02.json", "utf8"),
);

function evalCase(id: string): EvalCase {
  const parsed = parseEvalSet(fixture);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  const found = parsed.set.cases.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}

type Item = [id: string, category: string, evidence: string[]];

function candidate(items: Item[]): SummaryOutcome {
  return {
    kind: "candidate",
    candidate: {
      achievements: items.map(([id, category, evidence]) => ({
        id,
        category,
        title: `Fictional ${id}`,
        detail: `Fictional detail for ${id}.`,
        evidence: evidence.map((key) => {
          const [source, recordId] = key.split(":");
          return { source, recordId };
        }),
      })),
    },
  };
}

function score(
  id: string,
  summary: SummaryOutcome,
  coverage?: ReportCoverage[],
) {
  const current = evalCase(id);
  const report = assembleReport({
    date: "2026-09-18",
    timezone: "Australia/Sydney",
    manifest: current.manifest,
    coverage: coverage ?? current.coverage,
    summary,
  });
  return scoreReport(current, report);
}

function kinds(result: ReturnType<typeof score>) {
  return result.failures.map((failure) => failure.kind);
}

const goodCandidates: Record<string, Item[]> = {
  "case-01": [["a1", "progress", ["codex:codex-201"]]],
  "case-02": [],
  "case-03": [["a1", "decision", ["claude-code:claude-code-201"]]],
  "case-04": [["a1", "learning", ["chatgpt-web:chatgpt-web-201"]]],
  "case-05": [
    ["a1", "progress", ["codex:codex-203", "claude-code:claude-code-202"]],
  ],
  "case-06": [
    ["a1", "progress", ["codex:codex-204", "claude-code:claude-code-203"]],
  ],
  "case-07": [["a1", "progress", ["codex:codex-205"]]],
  "case-08": [
    ["a1", "progress", ["codex:codex-206"]],
    ["a2", "decision", ["claude-code:claude-code-204"]],
    ["a3", "clarification", ["codex:codex-207"]],
    ["a4", "learning", ["chatgpt-web:chatgpt-web-203"]],
    ["a5", "progress", ["codex:codex-208"]],
  ],
};

test("EV-1: a report meeting every expectation scores zero failures in all eight cases", () => {
  for (const [id, items] of Object.entries(goodCandidates)) {
    expect(score(id, candidate(items)), id).toEqual({
      caseId: id,
      critical: false,
      failures: [],
    });
  }
});

test("EV-2: a missing required item, or one with the wrong category, is missing-required", () => {
  expect(score("case-03", candidate([])).failures).toEqual([
    { kind: "missing-required", activityId: "json-cache-to-sqlite" },
  ]);
  expect(
    kinds(
      score(
        "case-03",
        candidate([["a1", "progress", ["claude-code:claude-code-201"]]]),
      ),
    ),
  ).toEqual(["missing-required"]);
});

test("EV-3: an item supported only by forbidden intention evidence is a critical failure", () => {
  const intention = score(
    "case-02",
    candidate([["a1", "progress", ["claude-web:claude-web-201"]]]),
  );
  expect(intention.critical).toBe(true);
  expect(intention.failures).toEqual([
    { kind: "forbidden", itemId: "a1", rule: "evidence-only" },
  ]);

  const readOnly = score(
    "case-04",
    candidate([
      ["a1", "learning", ["chatgpt-web:chatgpt-web-201"]],
      ["a2", "learning", ["chatgpt-web:chatgpt-web-202"]],
    ]),
  );
  expect(readOnly.critical).toBe(true);
  expect(kinds(readOnly)).toEqual(["forbidden"]);

  const allowedLint = score(
    "case-02",
    candidate([["a1", "progress", ["codex:codex-202"]]]),
  );
  expect(allowedLint.failures).toEqual([]);
});

test("EV-4: two items covering one expected activity are a duplicate failure", () => {
  const result = score(
    "case-05",
    candidate([
      ["a1", "progress", ["codex:codex-203", "claude-code:claude-code-202"]],
      ["a2", "learning", ["claude-code:claude-code-202"]],
    ]),
  );
  expect(result.critical).toBe(false);
  expect(result.failures).toEqual([
    {
      kind: "duplicate",
      activityId: "retry-timeout-fix",
      itemIds: ["a1", "a2"],
    },
  ]);
});

test("EV-5: a required item missing one of its source IDs is missing-source-id", () => {
  expect(
    score("case-05", candidate([["a1", "progress", ["codex:codex-203"]]]))
      .failures,
  ).toEqual([
    {
      kind: "missing-source-id",
      activityId: "retry-timeout-fix",
      itemId: "a1",
      missing: ["claude-code:claude-code-202"],
    },
  ]);
});

describe("EV-6 coverage", () => {
  test("EV-6: a report missing an expected incomplete source is a coverage failure", () => {
    const wrongCoverage: ReportCoverage[] = [
      { source: "codex", state: "included" },
      { source: "claude-code", state: "incomplete", reason: "unreadable" },
      { source: "gemini-web", state: "no-activity" },
      { source: "chatgpt-web", state: "not-enabled" },
    ];
    expect(
      score("case-07", candidate(goodCandidates["case-07"]!), wrongCoverage)
        .failures,
    ).toEqual([
      {
        kind: "coverage",
        expectedStatus: "incomplete",
        actualStatus: "incomplete",
        expectedIncompleteSources: ["claude-code", "gemini-web"],
        actualIncompleteSources: ["claude-code"],
      },
    ]);
  });

  test("EV-6: a wrong report status is a coverage failure", () => {
    const result = score("case-01", { kind: "unavailable" });
    expect(result.failures).toEqual([
      { kind: "missing-required", activityId: "harbor-cache-fix" },
      {
        kind: "coverage",
        expectedStatus: "complete",
        actualStatus: "incomplete",
        expectedIncompleteSources: [],
        actualIncompleteSources: [],
      },
    ]);
  });
});

describe("EV-7 more than five plausible achievements", () => {
  const eligible: Item[] = [
    ["a1", "progress", ["codex:codex-206"]],
    ["a2", "decision", ["claude-code:claude-code-204"]],
    ["a3", "clarification", ["codex:codex-207"]],
    ["a4", "learning", ["chatgpt-web:chatgpt-web-203"]],
    ["a5", "progress", ["codex:codex-208"]],
    ["a6", "decision", ["claude-code:claude-code-205"]],
  ];

  test("EV-7: any five distinct eligible items pass", () => {
    for (let omitted = 0; omitted < eligible.length; omitted += 1) {
      const five = eligible.filter((_, index) => index !== omitted);
      expect(score("case-08", candidate(five)).failures).toEqual([]);
    }
  });

  test("EV-7: including forbidden intention evidence fails critically", () => {
    const result = score(
      "case-08",
      candidate([
        ...eligible.slice(0, 4),
        ["a9", "progress", ["claude-web:claude-web-202"]],
      ]),
    );
    expect(result.critical).toBe(true);
    expect(kinds(result)).toEqual(["forbidden", "selection-count"]);
  });

  test("EV-7: four items, or six items that make the report invalid, fail the selection", () => {
    expect(score("case-08", candidate(eligible.slice(0, 4))).failures).toEqual([
      { kind: "selection-count", expected: 5, actual: 4 },
    ]);

    const six = score("case-08", candidate(eligible));
    expect(six.critical).toBe(false);
    expect(kinds(six)).toEqual(["selection-count", "coverage"]);
  });
});

test("EV-8: citing only the earlier completion record in the conflict case is forbidden", () => {
  const result = score(
    "case-06",
    candidate([["a1", "progress", ["codex:codex-204"]]]),
  );
  expect(result.critical).toBe(true);
  expect(result.failures).toEqual([
    { kind: "forbidden", itemId: "a1", rule: "cites-without" },
  ]);
  expect(score("case-06", candidate([])).failures).toEqual([]);
});

describe("EV-9 fixture integrity", () => {
  test("EV-9: all eight cases load and every referenced ID exists in its manifest", () => {
    const parsed = parseEvalSet(fixture);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.set.cases.map((current) => current.id)).toEqual([
      "case-01",
      "case-02",
      "case-03",
      "case-04",
      "case-05",
      "case-06",
      "case-07",
      "case-08",
    ]);
  });

  test("EV-9: an unknown evidence reference or malformed case is reported", () => {
    const broken = structuredClone(fixture) as {
      cases: Array<{ expect: { activities: Array<{ evidence: string[] }> } }>;
    };
    broken.cases[0]!.expect.activities[0]!.evidence = ["codex:codex-999"];
    const result = parseEvalSet(broken);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok)
      expect(result.problems.join("\n")).toContain("codex:codex-999");

    expect(parseEvalSet({ version: 1, cases: [{ id: "x" }] })).toMatchObject({
      ok: false,
    });
    expect(parseEvalSet(null)).toMatchObject({ ok: false });
  });
});
