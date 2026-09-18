# Synthetic set 02 — first model runs (2026-09-18)

The eight fictional cases in [synthetic set 02](../synthetic-set-02.md) and their
required, forbidden, duplicate, source-ID, and coverage expectations were
approved and committed on 2026-09-17, before any model saw them. Every run below
used the same draft prompt (`src/report/summary-prompt.ts`) and the same
machine-readable payloads, scored by `src/report/eval-scorer.ts` through
`scripts/experiments/eval-summary.mts`. Only fictional records were sent; tools
were disabled, the sandbox read-only, no session persisted, and each run's
temporary directory was removed.

## Results

| Model | Pass | Critical | Other failures | Per-case time |
| --- | --- | --- | --- | --- |
| Codex `gpt-5.6-luna` | 7/8 | 0 | 1 | 6–18s |
| Claude Code `haiku` | 7/8 | 0 | 1 | 12–31s |

Both models failed the same case and no other. No run produced a critical
failure, so neither fabricated a completion nor counted one activity twice.

- Case 06 (conflicting evidence) was not reported as complete by either model.
- Case 07 was reported `incomplete` with both `claude-code` and `gemini-web`
  marked `source-incomplete`, rather than as a day with no activity.
- Case 08 produced all five achievements in both runs.

## The shared failure: case 05

Case 05 is one activity evidenced by two sources: `codex-203` (the fix, with a
test that failed then passed) and `claude-code-202` (a later discussion of the
same fix, no further change). Both models produced exactly one item — the
duplicate-counting rule held — but cited only `codex-203` and omitted
`claude-code-202`.

Because the same omission appeared in two unrelated models, and because Claude
`sonnet` omitted a required source ID in the earlier
[synthetic day 01 review](synthetic-day-01-review.md), this reads as a gap in the
draft prompt's instruction to cite every supporting source, not as a capability
limit of cheap models. Incomplete evidence also has a cost consequence: the
contract fails closed on unknown or missing IDs, which burns re-analysis
attempts.

## Case 02 divergence, within the approved rule

Case 02 requires zero achievements and forbids any item evidenced only by the
stated intention. Codex reported one item (the passing lint run with no change);
Claude Code reported none. The approved case makes that lint item optional, so
both scored as passes. This is the fixture's deliberate latitude, not a
disagreement between the models.

## Measured cost

Read from the account usage card immediately before and after the Claude Code
run: the 5-hour window moved 40% → 41% and the weekly all-models window stayed
at 79%. That single point includes this session's own conversation, so eight
haiku cases cost less than one percentage point of the 5-hour window — below the
low end of the 1–15% share estimated before the run. The Codex run spends
ChatGPT Plus quota, which this project's sessions do not otherwise consume; no
comparable figure was captured for it.

## What this does not establish

One eight-case fictional set does not choose a permanent summarizer. It does not
test real source parsing, a long real day against the model input limit, Chrome
collection, scheduling, or report edits. The harness does not save raw model
replies, so these runs cannot be re-read; a specific case must be re-run to
inspect its output. No real day has been summarized.
