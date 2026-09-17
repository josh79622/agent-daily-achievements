# Report contract and output validation design

Status: **draft — awaiting Josh's approval.** No test or production code is
written until the decisions and test cases below are confirmed.

## Task framing

- Now: nothing defines what a daily report may contain, so future summarizer
  output could be stored with more than five items, invented source IDs, a
  plan presented as completed work, or a "complete" status the collector cannot
  support.
- When done: a local TypeScript validator accepts only contract-conforming
  output and otherwise produces an incomplete report with zero achievements; a
  deterministic scorer grades a report against predetermined fictional eval
  expectations. Acceptance: the RC, RA, RS, and EV cases below pass under
  `npm run check`.

Out of scope: running Codex or Claude Code, choosing a model, prompt changes,
a real collector payload, new server endpoints, browser UI changes, report
editing (Phase 5), and replacing the existing sample report used by the demo.

## Two layers

1. **Summarizer candidate** — untrusted, model-shaped JSON. It may contain only
   `achievements`. The model never sets report status or coverage.
2. **Assembled report** — built locally from the date, the server-built
   evidence manifest (what was sent), collector coverage, and the candidate.
   Status and coverage come only from local facts.

## Contract (schema version 1)

```ts
type AchievementCategory =
  | "progress" // observable work or concrete advance with execution evidence
  | "decision" // a choice with its stated reason
  | "clarification" // a question or cause resolved
  | "learning"; // understanding the user demonstrated, not merely read

type ReportSource =
  | "codex"
  | "claude-code"
  | "claude-web"
  | "chatgpt-web"
  | "gemini-web";

interface EvidenceRef {
  source: ReportSource;
  recordId: string; // collector session/conversation ID
  messageIds?: string[]; // optional narrower pointers within that record
}

interface Achievement {
  id: string;
  category: AchievementCategory;
  title: string; // 1–120 characters
  detail: string; // 1–500 characters
  evidence: EvidenceRef[]; // at least one
}

type CoverageState =
  | "included"
  | "no-activity"
  | "not-installed"
  | "not-enabled"
  | "incomplete";

interface ReportCoverage {
  source: ReportSource;
  state: CoverageState;
  reason?: "unreadable" | "unsupported-format" | "partial-write" | "collection-failed";
}

type IncompleteReason =
  | "source-incomplete"
  | "summary-unavailable"
  | "summary-invalid";

interface AchievementReportV1 {
  schemaVersion: 1;
  date: string; // YYYY-MM-DD in the saved report timezone
  timezone: string;
  status: "complete" | "incomplete";
  achievements: Achievement[]; // 0–5
  coverage: ReportCoverage[];
  incomplete: Array<{ reason: IncompleteReason; source?: ReportSource; issue?: ValidationIssue }>;
}
```

`ValidationIssue` is a fixed code list (for example `too-many-achievements`,
`unknown-evidence`). Reports and issues never echo candidate text that failed
validation. Intentions have no category: a plan is not representable as an
achievement.

## Validation rules (fail closed)

Any violation makes the whole candidate invalid. The assembled report then has
zero achievements and `summary-invalid` with the first issue code. Partially
valid items are not kept, so nothing is selected or rewritten locally.

1. The candidate is a JSON object with exactly the key `achievements`, an array.
2. Zero to five achievements (see decision D1).
3. Every achievement has exactly the keys above; the category is one of the four.
4. `id`, `title`, and `detail` are non-empty trimmed strings within limits; `id`
   values are unique.
5. Evidence is non-empty; each reference exists in the evidence manifest with
   the same source, and each `messageIds` entry exists in that record.
6. No duplicate evidence reference within one achievement.
7. Two achievements with the same category and identical evidence set are a
   duplicate.
8. Evidence may cite only sources whose coverage is `included`.

Deterministic validation cannot detect a semantic duplicate described with
different evidence, or prose that overclaims. The eval scorer and human review
cover those.

## Assembly and status

- `incomplete` if any selected (installed or enabled) source is `incomplete`,
  if no summary was produced, or if the candidate is invalid.
- `not-installed`, `not-enabled`, and `no-activity` never make a report
  incomplete by themselves.
- Valid candidate + no incomplete source = `complete`, including zero
  achievements.
- Achievements from a valid candidate are kept when a source is incomplete;
  the report still says incomplete for that source.

## Decisions requiring approval

- **D1 — Achievement count (Josh, 2026-09-17).** A report holds 0–5
  achievements. Output with more than five is invalid and must be re-analysed:
  the same summarizer is asked again with the same server-built payload.
  Nothing is truncated locally, so no hidden choice decides which achievements
  matter, and no priority rule among eligible achievements is set. Retry limit
  (Josh, 2026-09-17): three attempts in total (at most two re-analyses); if
  every attempt exceeds five, the report is `incomplete` with
  `summary-invalid` / `too-many-achievements`, and the existing fallback rule
  may then try the other usable CLI under maximum permission. Other invalid
  output is not retried.
- **D2 — Conflicting evidence.** Proposed: when a later record contradicts a
  completion (for example a test passed, then is reported failing again with no
  later fix), the report must not claim completion. It may omit the activity or
  include one item that cites both records and states the unresolved outcome.
  Scoring treats citing only the earlier "done" record as forbidden.
- **D3 — Coverage authority.** Proposed: the model cannot set status or
  coverage; they are derived locally only.

## Test cases (IDs fixed; status: awaiting confirmation)

Contract validation — `test/report/report-contract.test.ts`:

| ID | Intended behavior |
| --- | --- |
| RC-1 | A valid candidate with 0–5 achievements (tested at 0, 1, and 5), manifest evidence, and all sources included assembles as `complete` with those items unchanged. |
| RC-2 | Non-JSON-object input, a missing `achievements` array, or an extra top-level key (for example `status`) → incomplete, zero achievements, `summary-invalid`. |
| RC-3 | Six achievements → `summary-invalid` `too-many-achievements`, marked retryable; none kept (D1). |
| RC-4 | An unknown category, including `intention` or `plan` → invalid. |
| RC-5 | Empty, whitespace-only, overlong, or non-string title/detail/id; duplicate ids; extra achievement keys → invalid. |
| RC-6 | Empty evidence, an unknown record ID, a source mismatch, or an unknown message ID → `unknown-evidence`. |
| RC-7 | A repeated evidence reference in one item, or two items with same category and evidence set → invalid duplicate. |
| RC-8 | Evidence citing a source not `included` → invalid. |
| RC-9 | Invalid-output issues and the serialized report never contain candidate title/detail text. |

Assembly and coverage — same file:

| ID | Intended behavior |
| --- | --- |
| RA-1 | A selected source `incomplete` with a valid candidate → `incomplete`, `source-incomplete` for that source, valid achievements kept. |
| RA-2 | `not-installed`, `not-enabled`, and `no-activity` sources with a valid candidate → `complete`. |
| RA-3 | No candidate (summarizer unavailable or failed) → `incomplete`, `summary-unavailable`, zero achievements. |
| RA-4 | Valid empty candidate with complete coverage → `complete` with zero achievements. |
| RA-5 | Multiple incomplete reasons are all listed (source and summary). |

Re-analysis decision — `test/report/summary-retry.test.ts`. This is a pure
local decision function; it runs no summarizer:

| ID | Intended behavior |
| --- | --- |
| RS-1 | After attempt 1 or 2 returns `too-many-achievements`, the decision is re-analyse with the same provider. |
| RS-2 | After attempt 3 returns `too-many-achievements`, the decision is stop: incomplete `summary-invalid` / `too-many-achievements`. |
| RS-3 | Any other validation issue is not retried; the decision is stop with that issue. |
| RS-4 | A valid candidate on any attempt is accepted without further attempts. |

Eval scorer — `test/report/eval-scorer.test.ts`, using hand-written candidate
reports for the cases in `docs/evals/synthetic-set-02.md`:

| ID | Intended behavior |
| --- | --- |
| EV-1 | A report meeting every expectation of a case scores zero failures. |
| EV-2 | A missing required item (by required evidence) is reported. |
| EV-3 | An item whose evidence is only forbidden intention evidence is a critical false-completion failure. |
| EV-4 | Two items covering one expected activity's evidence count as a duplicate failure. |
| EV-5 | A required item missing one of its required source IDs is a source-ID failure. |
| EV-6 | Wrong status or missing incomplete source vs expectations is a coverage failure. |
| EV-7 | For the more-than-five case, any five distinct eligible non-forbidden items pass; a forbidden one fails. |
| EV-8 | For the conflict case, an item citing only the earlier completion record fails (D2). |
| EV-9 | The expectation JSON for all eight cases loads and every referenced ID exists in its case's manifest. |

Prose overclaiming (for example "the email was sent") is recorded as a manual
review check in the eval document, not a deterministic test.

## Files expected after approval

- `src/report/contract.ts` — types, validation, assembly.
- `src/report/eval-scorer.ts` — deterministic scoring against expectations.
- `test/report/*.test.ts` and `test/fixtures/report-eval/*.json` — fictional
  manifests, expectations, and hand-written candidates.
- `docs/evals/synthetic-set-02.md` — the eight fictional cases (drafted with
  this design).
