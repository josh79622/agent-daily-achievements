// Report contract, schema version 1. Design:
// docs/plans/2026-09-17-report-contract-design.md

export type AchievementCategory =
  "progress" | "decision" | "clarification" | "learning";

export type ReportSource =
  "codex" | "claude-code" | "claude-web" | "chatgpt-web" | "gemini-web";

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
}

export type CoverageState =
  "included" | "no-activity" | "not-installed" | "not-enabled" | "incomplete";

export interface ReportCoverage {
  source: ReportSource;
  state: CoverageState;
  reason?:
    "unreadable" | "unsupported-format" | "partial-write" | "collection-failed";
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
const achievementKeys = ["category", "detail", "evidence", "id", "title"];
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
      !hasExactKeys(achievement, achievementKeys)
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
  | { reason: "summary-invalid"; issue: ValidationIssue };

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
  { kind: "candidate"; candidate: unknown } | { kind: "unavailable" };

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
