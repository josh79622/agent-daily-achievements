// Deterministic scoring of an assembled report against predetermined,
// fictional eval expectations. Design:
// docs/plans/2026-09-17-report-contract-design.md and
// docs/evals/synthetic-set-02.md. Prose overclaiming is a manual check.

import type {
  AchievementCategory,
  AchievementReportV1,
  EvidenceManifest,
  ReportCoverage,
  ReportSource,
} from "./contract.js";

/** `source:recordId`, for example `codex:codex-201`. */
export type EvidenceKey = string;

export interface EvalActivity {
  id: string;
  category: AchievementCategory;
  evidence: EvidenceKey[];
}

export type ForbiddenRule =
  | {
      kind: "evidence-only";
      evidence: EvidenceKey[];
      category?: AchievementCategory;
    }
  | { kind: "cites-without"; cites: EvidenceKey; mustAlsoCite: EvidenceKey };

export interface EvalCase {
  id: string;
  title: string;
  manifest: EvidenceManifest;
  coverage: ReportCoverage[];
  expect: {
    status: "complete" | "incomplete";
    incompleteSources: ReportSource[];
    selection: { mode: "all" } | { mode: "choose"; count: number };
    activities: EvalActivity[];
    forbidden: ForbiddenRule[];
  };
}

export interface EvalSet {
  version: 1;
  cases: EvalCase[];
}

export type EvalFailure =
  | { kind: "forbidden"; itemId: string; rule: ForbiddenRule["kind"] }
  | { kind: "missing-required"; activityId: string }
  | { kind: "duplicate"; activityId: string; itemIds: string[] }
  | {
      kind: "missing-source-id";
      activityId: string;
      itemId: string;
      missing: EvidenceKey[];
    }
  | { kind: "selection-count"; expected: number; actual: number }
  | {
      kind: "coverage";
      expectedStatus: "complete" | "incomplete";
      actualStatus: "complete" | "incomplete";
      expectedIncompleteSources: ReportSource[];
      actualIncompleteSources: ReportSource[];
    };

export interface EvalScore {
  caseId: string;
  /** True when any forbidden claim is present. */
  critical: boolean;
  failures: EvalFailure[];
}

export function scoreReport(
  evalCase: EvalCase,
  report: AchievementReportV1,
): EvalScore {
  const { expect: expected } = evalCase;
  const items = report.achievements.map((achievement) => ({
    id: achievement.id,
    category: achievement.category,
    keys: new Set(
      achievement.evidence.map((ref) => `${ref.source}:${ref.recordId}`),
    ),
  }));

  const forbidden: EvalFailure[] = [];
  for (const item of items) {
    for (const rule of expected.forbidden) {
      const violates =
        rule.kind === "evidence-only"
          ? (!rule.category || rule.category === item.category) &&
            [...item.keys].every((key) => rule.evidence.includes(key))
          : item.keys.has(rule.cites) && !item.keys.has(rule.mustAlsoCite);
      if (violates) {
        forbidden.push({ kind: "forbidden", itemId: item.id, rule: rule.kind });
        break;
      }
    }
  }

  const missingRequired: EvalFailure[] = [];
  const duplicates: EvalFailure[] = [];
  const missingSourceIds: EvalFailure[] = [];
  let matched = 0;
  for (const activity of expected.activities) {
    const related = items.filter((item) =>
      activity.evidence.some((key) => item.keys.has(key)),
    );
    if (related.length > 1)
      duplicates.push({
        kind: "duplicate",
        activityId: activity.id,
        itemIds: related.map((item) => item.id),
      });
    const satisfying = related.find(
      (item) => item.category === activity.category,
    );
    if (!satisfying) {
      if (expected.selection.mode === "all")
        missingRequired.push({
          kind: "missing-required",
          activityId: activity.id,
        });
      continue;
    }
    matched += 1;
    const missing = activity.evidence.filter(
      (key) => !satisfying.keys.has(key),
    );
    if (missing.length)
      missingSourceIds.push({
        kind: "missing-source-id",
        activityId: activity.id,
        itemId: satisfying.id,
        missing,
      });
  }

  const selection: EvalFailure[] = [];
  if (
    expected.selection.mode === "choose" &&
    (matched !== expected.selection.count ||
      items.length !== expected.selection.count)
  )
    selection.push({
      kind: "selection-count",
      expected: expected.selection.count,
      actual: matched,
    });

  const coverage: EvalFailure[] = [];
  const actualIncompleteSources = report.incomplete
    .flatMap((entry) =>
      entry.reason === "source-incomplete" ? [entry.source] : [],
    )
    .sort();
  const expectedIncompleteSources = [...expected.incompleteSources].sort();
  if (
    report.status !== expected.status ||
    actualIncompleteSources.join() !== expectedIncompleteSources.join()
  )
    coverage.push({
      kind: "coverage",
      expectedStatus: expected.status,
      actualStatus: report.status,
      expectedIncompleteSources,
      actualIncompleteSources,
    });

  return {
    caseId: evalCase.id,
    critical: forbidden.length > 0,
    failures: [
      ...forbidden,
      ...missingRequired,
      ...duplicates,
      ...missingSourceIds,
      ...selection,
      ...coverage,
    ],
  };
}

const sources: readonly string[] = [
  "codex",
  "claude-code",
  "claude-web",
  "chatgpt-web",
  "gemini-web",
];
const categories: readonly string[] = [
  "progress",
  "decision",
  "clarification",
  "learning",
];
const coverageStates: readonly string[] = [
  "included",
  "no-activity",
  "not-installed",
  "not-enabled",
  "incomplete",
];

/** Checks an eval fixture's structure and that every evidence key exists. */
export function parseEvalSet(
  value: unknown,
): { ok: true; set: EvalSet } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.cases))
    return { ok: false, problems: ["Eval set needs version 1 and cases."] };

  const ids = new Set<string>();
  value.cases.forEach((entry, index) => {
    const at = `case[${index}]`;
    if (!isRecord(entry) || typeof entry.id !== "string") {
      problems.push(`${at}: missing id.`);
      return;
    }
    if (ids.has(entry.id)) problems.push(`${entry.id}: duplicate id.`);
    ids.add(entry.id);
    const name = entry.id;
    if (typeof entry.title !== "string")
      problems.push(`${name}: missing title.`);

    const manifestKeys = new Set<string>();
    if (
      !Array.isArray(entry.manifest) ||
      !entry.manifest.every(
        (record) =>
          isRecord(record) &&
          isOneOf(record.source, sources) &&
          typeof record.recordId === "string" &&
          isStringArray(record.messageIds),
      )
    )
      problems.push(`${name}: invalid manifest.`);
    else
      for (const record of entry.manifest as Array<Record<string, string>>)
        manifestKeys.add(`${record.source}:${record.recordId}`);

    if (
      !Array.isArray(entry.coverage) ||
      !entry.coverage.every(
        (item) =>
          isRecord(item) &&
          isOneOf(item.source, sources) &&
          isOneOf(item.state, coverageStates),
      )
    )
      problems.push(`${name}: invalid coverage.`);

    const expected = entry.expect;
    if (
      !isRecord(expected) ||
      !isOneOf(expected.status, ["complete", "incomplete"]) ||
      !Array.isArray(expected.incompleteSources) ||
      !expected.incompleteSources.every((source) => isOneOf(source, sources)) ||
      !validSelection(expected.selection) ||
      !Array.isArray(expected.activities) ||
      !Array.isArray(expected.forbidden)
    ) {
      problems.push(`${name}: invalid expectations.`);
      return;
    }

    const checkKey = (key: unknown) => {
      if (typeof key !== "string" || !manifestKeys.has(key))
        problems.push(`${name}: unknown evidence ${String(key)}.`);
    };
    for (const activity of expected.activities) {
      if (
        !isRecord(activity) ||
        typeof activity.id !== "string" ||
        !isOneOf(activity.category, categories) ||
        !isStringArray(activity.evidence) ||
        activity.evidence.length === 0
      ) {
        problems.push(`${name}: invalid activity.`);
        continue;
      }
      activity.evidence.forEach(checkKey);
    }
    for (const rule of expected.forbidden) {
      if (
        isRecord(rule) &&
        rule.kind === "evidence-only" &&
        isStringArray(rule.evidence) &&
        rule.evidence.length > 0 &&
        (rule.category === undefined || isOneOf(rule.category, categories))
      )
        rule.evidence.forEach(checkKey);
      else if (
        isRecord(rule) &&
        rule.kind === "cites-without" &&
        typeof rule.cites === "string" &&
        typeof rule.mustAlsoCite === "string"
      ) {
        checkKey(rule.cites);
        checkKey(rule.mustAlsoCite);
      } else problems.push(`${name}: invalid forbidden rule.`);
    }
  });

  return problems.length
    ? { ok: false, problems }
    : { ok: true, set: value as unknown as EvalSet };
}

function validSelection(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.mode === "all" ||
      (value.mode === "choose" &&
        Number.isInteger(value.count) &&
        (value.count as number) >= 0))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
