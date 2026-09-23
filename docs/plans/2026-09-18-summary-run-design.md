# Real summarizer run — design

Implements the last unstarted piece of `SummaryRunner` (`src/server/app.ts`):
actually invoking the selected CLI on a server-built payload and assembling an
`AchievementReportV1`. Test-only and fake-runner work; no real CLI or model run
is included in this task.

## What is already decided (not re-opened here)

- Retry limit and fallback (updated by Josh, 2026-09-23): every reply that
  fails deterministic validation (too many achievements, bad shape, unknown
  category/evidence, overlong field, or other contract issue) is re-analysed
  with the same provider and same payload, up to three attempts total. If the
  third reply is still invalid, save `incomplete` / `summary-invalid` with its
  final issue and count it as a failure of that CLI, so the caller (the existing
  `/api/reports/generate` provider loop in `app.ts`) tries the next permitted
  CLI. A valid reply is accepted immediately.
- A CLI that never produces a reply at all (could not start, timed out,
  non-zero exit, empty/unreadable/oversized reply) is `SummaryOutcome`
  `{ kind: "unavailable" }`. This also counts as a failure of that CLI for the
  provider loop, matching the existing behavior for CLI-execution failure.
- The prompt (`src/report/summary-prompt.ts`) and the eight-case eval
  (`docs/evals/synthetic-set-02.md`) are approved; today's runs
  ([record](../evals/results/synthetic-set-02-run-2026-09-18.md)) confirmed the
  fixed prompt at 8/8 on Codex `gpt-5.6-luna` and Claude Code `haiku`, not yet
  on `gpt-5.6-terra` or `sonnet`.
- Command shape follows the approved readiness probe
  ([design](2026-09-17-readiness-probe-design.md)): Claude Code
  `-p --tools '' --no-session-persistence --strict-mcp-config --output-format json`;
  Codex `exec --ephemeral --skip-git-repo-check --ignore-user-config --sandbox read-only`
  with the same disabled-feature list, a fresh temporary directory per attempt,
  and the reply read from `-o <file>`. The summary prompt replaces the probe's
  fixed connectivity text; model and effort come from
  `SummarizerModelsService.effectiveSettings`, not from probe-only overrides.

## What this task adds

- A larger timeout and reply cap than the probe's (a real day's payload is
  much larger than the probe's one-word exchange, and up to three attempts run
  in sequence). Proposed: 10 minutes per attempt, 512 KB reply cap — generous
  against the achievement schema's own limits (5 items, 500-character detail
  each), rejecting only a runaway reply. Not yet measured against a real run;
  revisit once one exists.
- Reply parsing: strip a leading/trailing Markdown code fence (as the eval
  harness already does), then `JSON.parse`; a parse failure becomes an
  unparseable placeholder object, which `validateSummaryCandidate` already
  rejects as `invalid-shape` without needing a new path.
- `createSummaryRunner({ locate, models, runner, tempDirs, readReplyFile, reportStore, now })`
  implementing `SummaryRunner.run(provider, request)`:
  1. Resolve the executable path (`locate(provider)`); no path -> unavailable.
  2. Resolve `{ model, effort }` from `models.effectiveSettings(provider)`.
  3. Loop attempts 1..3: spawn CLI with the summary prompt text
     (`buildSummaryRequestText(request.payload.payloadJson)`), read the reply,
     parse it, validate with `validateSummaryCandidate`, and apply
     `decideAfterAttempt`.
  4. On `accept` or `stop`, assemble the report via `assembleReport` and save
     it with `reportStore.save`; resolve `run()` normally.
  5. On exhausted `too-many-achievements`, or on no attempt producing any
     reply at all, throw so the caller's fallback loop tries the next CLI —
     but still save an `incomplete` report first, so a later scheduled attempt
     or a manual refresh has *something* to show even if every permitted CLI
     ends up failing. Open question below.

## Open for Josh

1. **Does the runner save an incomplete report before throwing for fallback,
   or only the final CLI in the loop gets to save?** Saving on every failed
   attempt means an all-CLIs-failed run still leaves an `incomplete` report
   with today's local coverage; saving only once (the caller catches all
   failures and could save a final `summary-unavailable` report itself) is
   simpler but requires moving the save out of the runner. Recommendation:
   save on every attempt, including ones that will still fall back — the
   store's `save` already represents "this is the current report," and an
   `incomplete` report is strictly more informative than none.
2. **Timeout and reply cap** above are proposed, not measured. They can change
   once a real payload's size and a real run's duration are known, without
   changing this design.

## Test cases (proposed IDs, awaiting approval before test code)

Pure/fake-runner tests only; no real CLI is invoked by any of them.

`test/summarizer/summary-run.test.ts`:

| ID | Intended behavior |
| --- | --- |
| SR-1 | A valid single-attempt reply (0, 1, and 5 achievements) is saved as a `complete` or `incomplete` report matching `assembleReport`'s own rules; `run()` resolves. |
| SR-2 | A reply wrapped in a Markdown code fence parses the same as bare JSON. |
| SR-3 | Unparseable JSON is treated as `invalid-shape` and re-analysed up to three attempts; a valid later reply is accepted. |
| SR-4 | `too-many-achievements` on attempt 1 triggers a second attempt with the identical request text; a valid reply on attempt 2 is accepted and saved. |
| SR-5 | `too-many-achievements` on all three attempts saves an `incomplete` report and `run()` throws. |
| SR-6 | Any other invalid issue (e.g. `unknown-evidence`) is re-analysed up to three attempts; three invalid replies save `incomplete` and trigger provider fallback. |
| SR-7 | No executable located → saved `unavailable`/`summary-unavailable`, `run()` throws. |
| SR-8 | The process runner reports could-not-start, timed out, non-zero exit, or an unreadable/empty/oversized reply → same as SR-7 for each reason. |
| SR-9 | The model and effort passed to the process match `models.effectiveSettings(provider)` for that provider; `undefined` omits the flag, matching the probe's convention. |
| SR-10 | Each attempt gets its own fresh temporary directory, removed after that attempt regardless of outcome. |
| SR-11 | The saved report's `coverage` and pre-existing `incomplete` entries (from `request.payload.coverage`) are preserved unchanged alongside any `summary-*` entry the run adds. |
