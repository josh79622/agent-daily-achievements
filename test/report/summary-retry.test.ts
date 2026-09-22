import { expect, test } from "vitest";

import type {
  Achievement,
  CandidateValidation,
  ValidationIssue,
} from "../../src/report/contract.js";
import {
  decideAfterAttempt,
  maxSummaryAttempts,
} from "../../src/report/summary-retry.js";

// Fictional achievement only.
const achievements: Achievement[] = [
  {
    id: "a1",
    category: "progress",
    title: "Fixed Harbor cache keys",
    detail: "The focused cache test failed, then passed after the change.",
    evidence: [{ source: "codex", recordId: "codex-201" }],
  },
];

const tooMany: CandidateValidation = {
  ok: false,
  issue: "too-many-achievements",
  retryable: true,
};

const otherIssues: ValidationIssue[] = [
  "invalid-shape",
  "invalid-category",
  "invalid-achievement",
  "duplicate-achievement-id",
  "unknown-evidence",
  "duplicate-evidence",
  "evidence-source-not-included",
];

test("the approved limit is three attempts in total", () => {
  expect(maxSummaryAttempts).toBe(3);
});

test("RS-1: attempts 1 and 2 with more than five achievements re-analyse with the same provider", () => {
  expect(decideAfterAttempt({ attempt: 1, validation: tooMany })).toEqual({
    action: "reanalyse",
    nextAttempt: 2,
  });
  expect(decideAfterAttempt({ attempt: 2, validation: tooMany })).toEqual({
    action: "reanalyse",
    nextAttempt: 3,
  });
});

test("RS-2: attempt 3 with more than five achievements stops as summary-invalid too-many-achievements", () => {
  expect(decideAfterAttempt({ attempt: 3, validation: tooMany })).toEqual({
    action: "stop",
    issue: "too-many-achievements",
  });
});

test("RS-3: every other validation issue re-analyses twice, then stops", () => {
  for (const attempt of [1, 2, 3]) {
    for (const issue of otherIssues) {
      expect(
        decideAfterAttempt({
          attempt,
          validation: { ok: false, issue, retryable: false },
        }),
      ).toEqual(
        attempt < 3
          ? { action: "reanalyse", nextAttempt: attempt + 1 }
          : { action: "stop", issue },
      );
    }
  }
});

test("RS-4: a valid candidate on any attempt is accepted without further attempts", () => {
  for (const attempt of [1, 2, 3]) {
    expect(
      decideAfterAttempt({
        attempt,
        validation: { ok: true, achievements },
      }),
    ).toEqual({ action: "accept", achievements });
  }
});

test("guard (regression, not an approved product case): attempt numbers outside 1-3 are rejected", () => {
  for (const attempt of [0, -1, 1.5, 4, Number.NaN]) {
    expect(() => decideAfterAttempt({ attempt, validation: tooMany })).toThrow(
      RangeError,
    );
  }
});
