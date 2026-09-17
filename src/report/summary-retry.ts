import type {
  Achievement,
  CandidateValidation,
  ValidationIssue,
} from "./contract.js";

// Approved by Josh on 2026-09-17: three attempts in total with the same
// summarizer and the same server-built payload. Only output with more than
// five achievements is re-analysed.
export const maxSummaryAttempts = 3;

export type SummaryAttemptDecision =
  | { action: "accept"; achievements: Achievement[] }
  | { action: "reanalyse"; nextAttempt: number }
  | { action: "stop"; issue: ValidationIssue };

/**
 * Decides what follows one summarizer attempt. It runs nothing; a later
 * runner acts on the decision. After `stop`, the report is assembled as
 * `summary-invalid` and the existing fallback rule may try another CLI.
 */
export function decideAfterAttempt({
  attempt,
  validation,
}: {
  attempt: number;
  validation: CandidateValidation;
}): SummaryAttemptDecision {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > maxSummaryAttempts)
    throw new RangeError("Summary attempt is outside the approved limit.");
  if (validation.ok)
    return { action: "accept", achievements: validation.achievements };
  if (
    validation.issue === "too-many-achievements" &&
    attempt < maxSummaryAttempts
  )
    return { action: "reanalyse", nextAttempt: attempt + 1 };
  return { action: "stop", issue: validation.issue };
}
