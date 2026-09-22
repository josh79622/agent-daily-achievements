import { describe, expect, test } from "vitest";

import {
  assembleReport,
  isValidAchievementEdit,
  validateSummaryCandidate,
  type EvidenceManifest,
  type ReportCoverage,
} from "../../src/report/contract.js";

// Fictional records only.
const manifest: EvidenceManifest = [
  { source: "codex", recordId: "codex-201", messageIds: ["m1", "m2"] },
  { source: "codex", recordId: "codex-202", messageIds: ["m1"] },
  { source: "claude-code", recordId: "claude-code-201", messageIds: ["m1"] },
  { source: "chatgpt-web", recordId: "chatgpt-web-201", messageIds: [] },
];

const allIncluded: ReportCoverage[] = [
  { source: "codex", state: "included" },
  { source: "claude-code", state: "included" },
  { source: "chatgpt-web", state: "included" },
];

const secretText = "FICTIONAL-CANDIDATE-TEXT-MUST-NOT-LEAK";

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    category: "progress",
    title: "Fixed Harbor cache keys",
    detail: "The focused cache test failed, then passed after the change.",
    evidence: [{ source: "codex", recordId: "codex-201" }],
    ...overrides,
  };
}

function validate(candidate: unknown, coverage = allIncluded) {
  return validateSummaryCandidate(candidate, { manifest, coverage });
}

function expectIssue(
  candidate: unknown,
  issue: string,
  coverage = allIncluded,
) {
  const result = validate(candidate, coverage);
  expect(result).toMatchObject({ ok: false, issue });
  expect(result).not.toHaveProperty("achievements");
  return result;
}

const categories = ["progress", "decision", "clarification", "learning"];
const evidenceIds = [
  { source: "codex", recordId: "codex-201" },
  { source: "codex", recordId: "codex-202" },
  { source: "claude-code", recordId: "claude-code-201" },
  { source: "chatgpt-web", recordId: "chatgpt-web-201" },
  { source: "codex", recordId: "codex-201", messageIds: ["m2"] },
];

describe("RC-1 valid candidate", () => {
  test("RC-1: 0, 1, and 5 achievements with manifest evidence are accepted unchanged", () => {
    const five = evidenceIds.map((evidence, index) =>
      item({
        id: `a${index + 1}`,
        category: categories[index % categories.length],
        evidence: [evidence],
      }),
    );
    for (const achievements of [[], [item()], five]) {
      const candidate = { achievements };
      const snapshot = structuredClone(candidate);
      expect(validate(candidate)).toEqual({ ok: true, achievements });
      expect(candidate).toEqual(snapshot);
    }
  });

  test("RC-1: message-level evidence within a known record is accepted", () => {
    const achievements = [
      item({
        evidence: [
          { source: "codex", recordId: "codex-201", messageIds: ["m1", "m2"] },
          { source: "claude-code", recordId: "claude-code-201" },
        ],
      }),
    ];
    expect(validate({ achievements })).toEqual({ ok: true, achievements });
  });

  test("RC-1: isPrimary boolean is accepted, and at most one true is allowed", () => {
    const valid = [
      item({
        id: "a1",
        isPrimary: true,
        evidence: [{ source: "codex", recordId: "codex-201" }],
      }),
      item({
        id: "a2",
        isPrimary: false,
        evidence: [{ source: "codex", recordId: "codex-202" }],
      }),
    ];
    expect(validate({ achievements: valid })).toEqual({
      ok: true,
      achievements: valid,
    });

    const twoPrimary = [
      item({
        id: "a1",
        isPrimary: true,
        evidence: [{ source: "codex", recordId: "codex-201" }],
      }),
      item({
        id: "a2",
        isPrimary: true,
        evidence: [{ source: "codex", recordId: "codex-202" }],
      }),
    ];
    expectIssue({ achievements: twoPrimary }, "invalid-achievement");

    const nonBooleanPrimary = [
      item({ id: "a1", isPrimary: "yes" as unknown as boolean }),
    ];
    expectIssue({ achievements: nonBooleanPrimary }, "invalid-achievement");
  });

  test("RC-1: project field is validated or inherited from manifest", () => {
    // 1. Explicit valid project
    const withProject = [
      item({
        id: "a1",
        project: "my-project",
        evidence: [{ source: "codex", recordId: "codex-201" }],
      }),
    ];
    const res1 = validate({ achievements: withProject });
    expect(res1).toEqual({
      ok: true,
      achievements: [
        {
          ...item({
            id: "a1",
            project: "my-project",
            evidence: [{ source: "codex", recordId: "codex-201" }],
          }),
        },
      ],
    });

    // 2. Inherited from manifest when absent in achievement
    const manifestWithProject: EvidenceManifest = [
      {
        source: "codex",
        recordId: "codex-proj-1",
        project: "inferred-project",
        messageIds: ["m1"],
      },
    ];
    const withoutProject = [
      item({
        id: "a2",
        evidence: [{ source: "codex", recordId: "codex-proj-1" }],
      }),
    ];
    const res2 = validateSummaryCandidate(
      { achievements: withoutProject },
      { manifest: manifestWithProject, coverage: allIncluded },
    );
    expect(res2).toEqual({
      ok: true,
      achievements: [
        {
          ...item({
            id: "a2",
            evidence: [{ source: "codex", recordId: "codex-proj-1" }],
          }),
          project: "inferred-project",
        },
      ],
    });

    // 3. Invalid project: empty string, whitespace, overlong, non-string
    expectIssue(
      { achievements: [item({ project: "" })] },
      "invalid-achievement",
    );
    expectIssue(
      { achievements: [item({ project: "   " })] },
      "invalid-achievement",
    );
    expectIssue(
      { achievements: [item({ project: "x".repeat(101) })] },
      "invalid-achievement",
    );
    expectIssue(
      { achievements: [item({ project: 123 as unknown as string })] },
      "invalid-achievement",
    );
  });

  test("RC-1: checkCandidate overrides hallucinated candidate project with authoritative entry.project from manifest", () => {
    const manifestWithProject: EvidenceManifest = [
      {
        source: "codex",
        recordId: "codex-proj-1",
        project: "agent-daily-achievements",
        messageIds: ["m1"],
      },
    ];
    const candidate = {
      achievements: [
        item({
          id: "a1",
          project: "xreview",
          evidence: [{ source: "codex", recordId: "codex-proj-1" }],
        }),
      ],
    };
    const result = validateSummaryCandidate(candidate, {
      manifest: manifestWithProject,
      coverage: allIncluded,
    });
    expect(result).toEqual({
      ok: true,
      achievements: [
        {
          ...item({
            id: "a1",
            evidence: [{ source: "codex", recordId: "codex-proj-1" }],
          }),
          project: "agent-daily-achievements",
        },
      ],
    });
  });
});

test("RC-2: non-object input, missing achievements array, or extra top-level keys are invalid-shape", () => {
  for (const candidate of [
    undefined,
    null,
    '{"achievements":[]}',
    42,
    [],
    {},
    { achievements: "none" },
    { achievements: {} },
    { achievements: [], status: "complete" },
    { achievements: [], coverage: [] },
  ]) {
    expectIssue(candidate, "invalid-shape");
  }
});

test("RC-3: six achievements are too-many-achievements, retryable, and none are kept", () => {
  const six = Array.from({ length: 6 }, (_, index) =>
    item({ id: `a${index + 1}`, evidence: [evidenceIds[index % 5]] }),
  );
  const result = expectIssue({ achievements: six }, "too-many-achievements");
  expect(result).toMatchObject({ retryable: true });
});

test("RC-3: other invalid output is not retryable", () => {
  expect(validate(null)).toMatchObject({ ok: false, retryable: false });
});

test("RC-4: unknown categories, including intention and plan, are invalid-category", () => {
  for (const category of ["intention", "plan", "Progress", "", 1, undefined]) {
    expectIssue({ achievements: [item({ category })] }, "invalid-category");
  }
});

describe("RC-5 achievement fields", () => {
  test("RC-5: empty, whitespace-only, overlong, or non-string fields are invalid-achievement", () => {
    const bad = [
      { id: "" },
      { id: "   " },
      { id: 7 },
      { id: "x".repeat(65) },
      { title: "" },
      { title: " \n\t" },
      { title: "x".repeat(121) },
      { title: null },
      { detail: "" },
      { detail: "   " },
      { detail: "x".repeat(501) },
      { detail: ["text"] },
    ];
    for (const overrides of bad) {
      expectIssue({ achievements: [item(overrides)] }, "invalid-achievement");
    }
  });

  test("RC-5: boundary lengths are accepted", () => {
    const achievements = [
      item({
        id: "x".repeat(64),
        title: "x".repeat(120),
        detail: "x".repeat(500),
      }),
    ];
    expect(validate({ achievements })).toEqual({ ok: true, achievements });
  });

  test("RC-5: missing or extra achievement keys are invalid-achievement", () => {
    const missingDetail: Record<string, unknown> = item();
    delete missingDetail.detail;
    for (const achievement of [
      missingDetail,
      item({ status: "complete" }),
      item({ confidence: 0.9 }),
      "not an object",
      null,
    ]) {
      expectIssue({ achievements: [achievement] }, "invalid-achievement");
    }
  });

  test("RC-5: duplicate achievement ids are duplicate-achievement-id", () => {
    expectIssue(
      {
        achievements: [
          item({ id: "same" }),
          item({
            id: "same",
            category: "decision",
            evidence: [{ source: "codex", recordId: "codex-202" }],
          }),
        ],
      },
      "duplicate-achievement-id",
    );
  });
});

test("RC-6: empty, unknown, mismatched, or malformed evidence is unknown-evidence", () => {
  for (const evidence of [
    [],
    "codex-201",
    [{ source: "codex", recordId: "codex-999" }],
    [{ source: "claude-code", recordId: "codex-201" }],
    [{ source: "gemini-web", recordId: "codex-201" }],
    [{ source: "codex", recordId: "codex-201", messageIds: ["m9"] }],
    [{ source: "codex", recordId: "codex-201", messageIds: [] }],
    [{ source: "codex", recordId: "codex-201", messageIds: "m1" }],
    [{ source: "codex", recordId: "codex-201", url: "https://example.test" }],
    [{ source: "codex" }],
    [null],
  ]) {
    expectIssue({ achievements: [item({ evidence })] }, "unknown-evidence");
  }
});

describe("RC-7 duplicates", () => {
  test("RC-7: a repeated evidence reference within one achievement is duplicate-evidence", () => {
    for (const evidence of [
      [
        { source: "codex", recordId: "codex-201" },
        { source: "codex", recordId: "codex-201" },
      ],
      [
        { source: "codex", recordId: "codex-201", messageIds: ["m1", "m2"] },
        { source: "codex", recordId: "codex-201", messageIds: ["m2", "m1"] },
      ],
      [{ source: "codex", recordId: "codex-201", messageIds: ["m1", "m1"] }],
    ]) {
      expectIssue({ achievements: [item({ evidence })] }, "duplicate-evidence");
    }
  });

  test("RC-7: two achievements with the same category and evidence set are duplicate-evidence", () => {
    expectIssue(
      {
        achievements: [
          item({
            id: "a1",
            evidence: [
              { source: "codex", recordId: "codex-201" },
              { source: "claude-code", recordId: "claude-code-201" },
            ],
          }),
          item({
            id: "a2",
            title: "Different wording for the same fix",
            evidence: [
              { source: "claude-code", recordId: "claude-code-201" },
              { source: "codex", recordId: "codex-201" },
            ],
          }),
        ],
      },
      "duplicate-evidence",
    );
  });

  test("RC-7: the same evidence under different categories is allowed", () => {
    const achievements = [
      item({ id: "a1", category: "progress" }),
      item({ id: "a2", category: "learning" }),
    ];
    expect(validate({ achievements })).toEqual({ ok: true, achievements });
  });
});

test("RC-8: evidence citing a source whose coverage is not included is evidence-source-not-included", () => {
  for (const state of [
    "incomplete",
    "no-activity",
    "not-installed",
    "not-enabled",
  ] as const) {
    const coverage: ReportCoverage[] = [
      { source: "codex", state: "included" },
      { source: "claude-code", state },
    ];
    expectIssue(
      {
        achievements: [
          item({
            evidence: [{ source: "claude-code", recordId: "claude-code-201" }],
          }),
        ],
      },
      "evidence-source-not-included",
      coverage,
    );
  }
  expectIssue(
    {
      achievements: [
        item({
          evidence: [{ source: "chatgpt-web", recordId: "chatgpt-web-201" }],
        }),
      ],
    },
    "evidence-source-not-included",
    [{ source: "codex", state: "included" }],
  );
});

test("RC-9: invalid results never contain candidate text", () => {
  const leaky = {
    id: secretText,
    title: secretText,
    detail: secretText,
    category: secretText,
  };
  const candidates: unknown[] = [
    secretText,
    { achievements: [], [secretText]: secretText },
    { achievements: Array.from({ length: 6 }, () => item(leaky)) },
    { achievements: [item({ category: secretText, title: secretText })] },
    { achievements: [item({ title: secretText.repeat(10) })] },
    {
      achievements: [
        item({
          detail: secretText,
          evidence: [{ source: "codex", recordId: secretText }],
        }),
      ],
    },
    { achievements: [item({ id: secretText }), item({ id: secretText })] },
  ];
  for (const candidate of candidates) {
    const result = validate(candidate);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("FICTIONAL-CANDIDATE");
  }
});

function assemble(
  summary: Parameters<typeof assembleReport>[0]["summary"],
  coverage: ReportCoverage[] = allIncluded,
) {
  return assembleReport({
    date: "2026-09-18",
    timezone: "Australia/Sydney",
    manifest,
    coverage,
    summary,
  });
}

describe("RA assembly", () => {
  test("RC-1/RC-2 via assembly: valid output is complete; invalid output is incomplete with no achievements", () => {
    const achievements = [item()];
    expect(
      assemble({ kind: "candidate", candidate: { achievements } }),
    ).toEqual({
      schemaVersion: 1,
      date: "2026-09-18",
      timezone: "Australia/Sydney",
      status: "complete",
      achievements,
      coverage: allIncluded,
      incomplete: [],
    });

    const invalid = assemble({
      kind: "candidate",
      candidate: { achievements, status: "complete" },
    });
    expect(invalid).toMatchObject({
      status: "incomplete",
      achievements: [],
      incomplete: [{ reason: "summary-invalid", issue: "invalid-shape" }],
    });
  });

  test("RA-1: an incomplete selected source keeps valid achievements but marks the report incomplete", () => {
    const coverage: ReportCoverage[] = [
      { source: "codex", state: "included" },
      { source: "claude-code", state: "incomplete", reason: "unreadable" },
    ];
    const achievements = [item()];

    const report = assemble(
      { kind: "candidate", candidate: { achievements } },
      coverage,
    );

    expect(report.status).toBe("incomplete");
    expect(report.achievements).toEqual(achievements);
    expect(report.coverage).toEqual(coverage);
    expect(report.incomplete).toEqual([
      { reason: "source-incomplete", source: "claude-code" },
    ]);
  });

  test("RA-2: not-installed, not-enabled, and no-activity sources do not make a report incomplete", () => {
    const coverage: ReportCoverage[] = [
      { source: "codex", state: "included" },
      { source: "claude-code", state: "not-installed" },
      { source: "gemini-web", state: "not-enabled" },
      { source: "chatgpt-web", state: "no-activity" },
    ];

    const report = assemble(
      { kind: "candidate", candidate: { achievements: [item()] } },
      coverage,
    );

    expect(report).toMatchObject({ status: "complete", incomplete: [] });
    expect(report.coverage).toEqual(coverage);
  });

  test("RA-3: no summarizer result is incomplete with summary-unavailable and zero achievements", () => {
    expect(assemble({ kind: "unavailable" })).toMatchObject({
      status: "incomplete",
      achievements: [],
      coverage: allIncluded,
      incomplete: [{ reason: "summary-unavailable" }],
    });
  });

  test("RA-4: a valid empty candidate with complete coverage is complete with zero achievements", () => {
    expect(
      assemble({ kind: "candidate", candidate: { achievements: [] } }),
    ).toMatchObject({ status: "complete", achievements: [], incomplete: [] });
  });

  test("RA-5: every incomplete source and the summary failure are all listed", () => {
    const coverage: ReportCoverage[] = [
      { source: "codex", state: "included" },
      { source: "claude-code", state: "incomplete", reason: "partial-write" },
      {
        source: "gemini-web",
        state: "incomplete",
        reason: "collection-failed",
      },
    ];

    expect(
      assemble(
        { kind: "candidate", candidate: { achievements: [], extra: true } },
        coverage,
      ).incomplete,
    ).toEqual([
      { reason: "source-incomplete", source: "claude-code" },
      { reason: "source-incomplete", source: "gemini-web" },
      { reason: "summary-invalid", issue: "invalid-shape" },
    ]);
    expect(assemble({ kind: "unavailable" }, coverage).incomplete).toEqual([
      { reason: "source-incomplete", source: "claude-code" },
      { reason: "source-incomplete", source: "gemini-web" },
      { reason: "summary-unavailable" },
    ]);
  });
});

describe("RE isValidAchievementEdit", () => {
  test("RE-a: a title-only, detail-only, or both edit is valid", () => {
    expect(isValidAchievementEdit({ title: "Fixed title" })).toBe(true);
    expect(isValidAchievementEdit({ detail: "Fixed detail" })).toBe(true);
    expect(
      isValidAchievementEdit({ title: "Fixed title", detail: "Fixed detail" }),
    ).toBe(true);
  });

  test("RE-b: empty object, unknown keys, or id/category/evidence are rejected", () => {
    expect(isValidAchievementEdit({})).toBe(false);
    expect(isValidAchievementEdit({ title: "ok", status: "done" })).toBe(false);
    expect(isValidAchievementEdit({ id: "new-id" })).toBe(false);
    expect(isValidAchievementEdit({ category: "learning" })).toBe(false);
    expect(isValidAchievementEdit({ evidence: [] })).toBe(false);
  });

  test("RE-c: empty, whitespace-only, overlong, or non-string text is rejected", () => {
    expect(isValidAchievementEdit({ title: "" })).toBe(false);
    expect(isValidAchievementEdit({ title: "   " })).toBe(false);
    expect(isValidAchievementEdit({ title: "x".repeat(121) })).toBe(false);
    expect(isValidAchievementEdit({ title: "x".repeat(120) })).toBe(true);
    expect(isValidAchievementEdit({ detail: "x".repeat(501) })).toBe(false);
    expect(isValidAchievementEdit({ detail: "x".repeat(500) })).toBe(true);
    expect(isValidAchievementEdit({ title: 5 })).toBe(false);
  });

  test("RE-d: non-object input is rejected", () => {
    expect(isValidAchievementEdit(null)).toBe(false);
    expect(isValidAchievementEdit("title")).toBe(false);
    expect(isValidAchievementEdit([])).toBe(false);
  });

  test("RE-e: isPrimary boolean edit is valid, non-boolean is rejected", () => {
    expect(isValidAchievementEdit({ isPrimary: true })).toBe(true);
    expect(isValidAchievementEdit({ isPrimary: false })).toBe(true);
    expect(isValidAchievementEdit({ title: "ok", isPrimary: true })).toBe(true);
    expect(isValidAchievementEdit({ isPrimary: "yes" })).toBe(false);
    expect(isValidAchievementEdit({ isPrimary: 1 })).toBe(false);
  });

  test("RE-f: project string edit is valid, overlong or non-string is rejected", () => {
    expect(isValidAchievementEdit({ project: "my-project" })).toBe(true);
    expect(isValidAchievementEdit({ project: "" })).toBe(true);
    expect(isValidAchievementEdit({ project: "x".repeat(100) })).toBe(true);
    expect(isValidAchievementEdit({ project: "x".repeat(101) })).toBe(false);
    expect(isValidAchievementEdit({ project: 123 as unknown as string })).toBe(
      false,
    );
    expect(isValidAchievementEdit({ title: "ok", project: "my-project" })).toBe(
      true,
    );
  });
});
