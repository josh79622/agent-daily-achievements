import { describe, expect, test } from "vitest";

import {
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
