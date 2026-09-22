// Report contract, schema version 1. Design:
// docs/plans/2026-09-17-report-contract-design.md

export type AchievementCategory =
  "progress" | "decision" | "clarification" | "learning";

export type ReportSource =
  | "codex"
  | "claude-code"
  | "claude-web"
  | "chatgpt-web"
  | "gemini-web"
  | "antigravity";

export interface EvidenceRef {
  source: ReportSource;
  recordId: string;
  messageIds?: string[];
}

export interface Achievement {
  id: string;
  category: AchievementCategory;
  title: string;
  detail: string;
  evidence: EvidenceRef[];
  isPrimary?: boolean;
}

export type CoverageState =
  "included" | "no-activity" | "not-installed" | "not-enabled" | "incomplete";

export interface ReportCoverage {
  source: ReportSource;
  state: CoverageState;
  reason?:
    | "collection-failed"
    | "duplicate-conflict"
    | "duplicate-session"
    | "malformed-record"
    | "partial-write"
    | "unreadable"
    | "unsupported-format";
}

/** The records actually sent to the summarizer, built server-side. */
export type EvidenceManifest = ReadonlyArray<{
  source: ReportSource;
  recordId: string;
  messageIds: readonly string[];
}>;

export type ValidationIssue =
  | "invalid-shape"
  | "too-many-achievements"
  | "invalid-category"
  | "invalid-achievement"
  | "duplicate-achievement-id"
  | "unknown-evidence"
  | "duplicate-evidence"
  | "evidence-source-not-included";

export type CandidateValidation =
  | { ok: true; achievements: Achievement[] }
  | { ok: false; issue: ValidationIssue; retryable: boolean };

export const maxAchievements = 5;

const categories: readonly string[] = [
  "progress",
  "decision",
  "clarification",
  "learning",
];
const requiredAchievementKeys = [
  "category",
  "detail",
  "evidence",
  "id",
  "title",
];
const allowedAchievementKeys = [...requiredAchievementKeys, "isPrimary"];
const limits = { id: 64, title: 120, detail: 500 } as const;

class Invalid extends Error {
  constructor(readonly issue: ValidationIssue) {
    super(issue);
  }
}

/**
 * Validates untrusted summarizer output. Any violation rejects the whole
 * candidate; results never echo candidate text.
 */
export function validateSummaryCandidate(
  candidate: unknown,
  context: {
    manifest: EvidenceManifest;
    coverage: readonly ReportCoverage[];
  },
): CandidateValidation {
  try {
    return { ok: true, achievements: checkCandidate(candidate, context) };
  } catch (error) {
    if (!(error instanceof Invalid)) throw error;
    return {
      ok: false,
      issue: error.issue,
      retryable: error.issue === "too-many-achievements",
    };
  }
}

function checkCandidate(
  candidate: unknown,
  {
    manifest,
    coverage,
  }: { manifest: EvidenceManifest; coverage: readonly ReportCoverage[] },
): Achievement[] {
  if (!isPlainObject(candidate) || !hasExactKeys(candidate, ["achievements"]))
    throw new Invalid("invalid-shape");
  const achievements = candidate.achievements;
  if (!Array.isArray(achievements)) throw new Invalid("invalid-shape");
  if (achievements.length > maxAchievements)
    throw new Invalid("too-many-achievements");

  const included = new Set(
    coverage
      .filter((entry) => entry.state === "included")
      .map((entry) => entry.source),
  );
  const ids = new Set<string>();
  const evidenceSets = new Set<string>();

  for (const achievement of achievements) {
    if (
      !isPlainObject(achievement) ||
      !hasOnlyKeys(achievement, allowedAchievementKeys) ||
      !requiredAchievementKeys.every((key) => key in achievement)
    )
      throw new Invalid("invalid-achievement");
    if (
      "isPrimary" in achievement &&
      typeof achievement.isPrimary !== "boolean"
    )
      throw new Invalid("invalid-achievement");
    if (
      typeof achievement.category !== "string" ||
      !categories.includes(achievement.category)
    )
      throw new Invalid("invalid-category");
    for (const field of ["id", "title", "detail"] as const) {
      const value = achievement[field];
      if (
        typeof value !== "string" ||
        value.trim() === "" ||
        value.length > limits[field]
      )
        throw new Invalid("invalid-achievement");
    }
    const id = achievement.id as string;
    if (ids.has(id)) throw new Invalid("duplicate-achievement-id");
    ids.add(id);

    const keys = checkEvidence(achievement.evidence, manifest, included);
    const evidenceSet = JSON.stringify([
      achievement.category,
      [...keys].sort(),
    ]);
    if (evidenceSets.has(evidenceSet)) throw new Invalid("duplicate-evidence");
    evidenceSets.add(evidenceSet);
  }
  const primaryCount = achievements.filter(
    (achievement) =>
      isPlainObject(achievement) && achievement.isPrimary === true,
  ).length;
  if (primaryCount > 1) throw new Invalid("invalid-achievement");
  return achievements as Achievement[];
}

function checkEvidence(
  evidence: unknown,
  manifest: EvidenceManifest,
  included: ReadonlySet<ReportSource>,
): Set<string> {
  if (!Array.isArray(evidence) || evidence.length === 0)
    throw new Invalid("unknown-evidence");
  const keys = new Set<string>();
  for (const ref of evidence) {
    if (
      !isPlainObject(ref) ||
      !hasOnlyKeys(ref, ["source", "recordId", "messageIds"]) ||
      typeof ref.source !== "string" ||
      typeof ref.recordId !== "string"
    )
      throw new Invalid("unknown-evidence");
    const record = manifest.find(
      (entry) => entry.source === ref.source && entry.recordId === ref.recordId,
    );
    if (!record) throw new Invalid("unknown-evidence");

    let messageIds: string[] = [];
    if ("messageIds" in ref) {
      if (
        !Array.isArray(ref.messageIds) ||
        ref.messageIds.length === 0 ||
        !ref.messageIds.every(
          (messageId) =>
            typeof messageId === "string" &&
            record.messageIds.includes(messageId),
        )
      )
        throw new Invalid("unknown-evidence");
      messageIds = ref.messageIds as string[];
      if (new Set(messageIds).size !== messageIds.length)
        throw new Invalid("duplicate-evidence");
    }
    if (!included.has(record.source))
      throw new Invalid("evidence-source-not-included");

    const key = JSON.stringify([
      record.source,
      record.recordId,
      [...messageIds].sort(),
    ]);
    if (keys.has(key)) throw new Invalid("duplicate-evidence");
    keys.add(key);
  }
  return keys;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => keys.includes(key))
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export type IncompleteEntry =
  | { reason: "source-incomplete"; source: ReportSource }
  | { reason: "summary-unavailable" }
  | { reason: "summary-invalid"; issue: ValidationIssue }
  | {
      reason: "summary-chunk-failed";
      chunkIndex: number;
      issue?: ValidationIssue;
    }
  | { reason: "summary-merge-unavailable" }
  | { reason: "summary-merge-invalid"; issue: ValidationIssue }
  | { reason: "summary-merge-too-large" }
  | {
      reason: "summary-message-too-large";
      source: ReportSource;
      recordId: string;
      messageId: string;
    };

export interface AchievementReportV1 {
  schemaVersion: 1;
  date: string;
  timezone: string;
  status: "complete" | "incomplete";
  achievements: Achievement[];
  coverage: ReportCoverage[];
  incomplete: IncompleteEntry[];
}

/** What the summarizer run produced; `unavailable` covers no run or a failed run. */
export type SummaryOutcome =
  | { kind: "candidate"; candidate: unknown }
  | { kind: "unavailable" }
  | { kind: "invalid"; issue: ValidationIssue }
  | { kind: "chunk-failed"; chunkIndex: number; issue?: ValidationIssue }
  | { kind: "merge-unavailable" }
  | { kind: "merge-invalid"; issue: ValidationIssue }
  | { kind: "merge-too-large" }
  | {
      kind: "message-too-large";
      source: ReportSource;
      recordId: string;
      messageId: string;
    };

/**
 * Minimal storage the real summarizer run needs: just the one method it
 * calls. `src/storage/report-store.ts`'s `ReportStore` now stores this same
 * `AchievementReportV1` shape (decision 1, resolved 2026-09-18), so
 * `index.ts` can pass one store to both the app and the summary runner —
 * this interface just avoids handing the runner `readLatest`, which it never
 * calls.
 */
export interface AchievementReportStore {
  save(report: AchievementReportV1): Promise<void>;
}

/**
 * Builds the stored report. Status and coverage come only from local facts
 * (collector coverage and the summarizer outcome), never from the candidate.
 */
export function assembleReport({
  date,
  timezone,
  manifest,
  coverage,
  summary,
}: {
  date: string;
  timezone: string;
  manifest: EvidenceManifest;
  coverage: readonly ReportCoverage[];
  summary: SummaryOutcome;
}): AchievementReportV1 {
  const incomplete: IncompleteEntry[] = coverage
    .filter((entry) => entry.state === "incomplete")
    .map((entry) => ({ reason: "source-incomplete", source: entry.source }));

  let achievements: Achievement[] = [];
  if (summary.kind === "unavailable") {
    incomplete.push({ reason: "summary-unavailable" });
  } else if (summary.kind === "invalid") {
    incomplete.push({ reason: "summary-invalid", issue: summary.issue });
  } else if (summary.kind === "chunk-failed") {
    incomplete.push({
      reason: "summary-chunk-failed",
      chunkIndex: summary.chunkIndex,
      ...(summary.issue === undefined ? {} : { issue: summary.issue }),
    });
  } else if (summary.kind === "merge-unavailable") {
    incomplete.push({ reason: "summary-merge-unavailable" });
  } else if (summary.kind === "merge-invalid") {
    incomplete.push({ reason: "summary-merge-invalid", issue: summary.issue });
  } else if (summary.kind === "merge-too-large") {
    incomplete.push({ reason: "summary-merge-too-large" });
  } else if (summary.kind === "message-too-large") {
    incomplete.push({
      reason: "summary-message-too-large",
      source: summary.source,
      recordId: summary.recordId,
      messageId: summary.messageId,
    });
  } else {
    const result = validateSummaryCandidate(summary.candidate, {
      manifest,
      coverage,
    });
    if (result.ok) achievements = structuredClone(result.achievements);
    else incomplete.push({ reason: "summary-invalid", issue: result.issue });
  }

  return {
    schemaVersion: 1,
    date,
    timezone,
    status: incomplete.length ? "incomplete" : "complete",
    achievements,
    coverage: structuredClone([...coverage]),
    incomplete,
  };
}

export type AchievementEdit = Partial<
  Pick<Achievement, "title" | "detail" | "isPrimary">
>;

/**
 * Josh's own correction to an achievement in an already-saved report
 * (BRIEF.md: an incorrect item must be correctable or removable). Distinct
 * from `validateSummaryCandidate`, which checks untrusted summarizer output
 * before a report is first saved; this checks a human edit to a report
 * already on disk, and never touches `id`, `category`, or `evidence` — a
 * correction changes what is said, not what it is evidenced by.
 */
export function isValidAchievementEdit(
  value: unknown,
): value is AchievementEdit {
  if (!isPlainObject(value)) return false;
  if (
    Object.keys(value).length === 0 ||
    !hasOnlyKeys(value, ["title", "detail", "isPrimary"])
  )
    return false;
  for (const field of ["title", "detail"] as const) {
    if (!(field in value)) continue;
    const text = value[field];
    if (
      typeof text !== "string" ||
      text.trim() === "" ||
      text.length > limits[field]
    )
      return false;
  }
  if ("isPrimary" in value && typeof value.isPrimary !== "boolean") {
    return false;
  }
  return true;
}
