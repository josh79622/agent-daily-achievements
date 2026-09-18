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

| Model | Tier | Pass | Critical | Other failures | Per-case time |
| --- | --- | --- | --- | --- | --- |
| Codex `gpt-5.6-luna` | cheapest | 7/8 | 0 | 1 | 6–18s |
| Claude Code `haiku` | cheapest | 7/8 | 0 | 1 | 12–31s |
| Codex `gpt-5.6-terra` | next tier | 7/8 | 0 | 1 | 8–16s |
| Claude Code `sonnet` | next tier | 7/8 | 0 | 1 | 4–11s |

All four models scored identically, failed the same single case, and produced no
critical failure: none fabricated a completion or counted one activity twice.
Paying for a higher tier bought nothing measurable on this set. Sonnet was the
fastest run of the four, so speed here does not track tier either.

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

Because the same omission appeared in all four models across two providers and
two price tiers, and because Claude `sonnet` omitted a required source ID in the
earlier
[synthetic day 01 review](synthetic-day-01-review.md), this reads as a gap in the
draft prompt's instruction to cite every supporting source, not as a capability
limit of cheap models. Incomplete evidence also has a cost consequence: the
contract fails closed on unknown or missing IDs, which burns re-analysis
attempts.

## Case 02 divergence, within the approved rule

Case 02 requires zero achievements and forbids any item evidenced only by the
stated intention. Both Codex models reported one item (the passing lint run with
no change); both Claude Code models reported none. The approved case makes that
lint item optional, so all four scored as passes. The split is by provider, not
by tier, and it is the fixture's deliberate latitude rather than a disagreement
about the rule.

## Measured cost

Read from the account usage card immediately before and after each Claude Code
run: haiku moved the 5-hour window 40% → 41%, and sonnet moved it 45% → 46%. The
weekly all-models window did not move for either (79%, then 80%). Both readings
include this session's own conversation, so eight cases cost under one
percentage point of the 5-hour window at either tier — below the low end of the
1–15% share estimated before the runs. The Codex runs spend ChatGPT Plus quota,
which this project's sessions do not otherwise consume; no comparable figure was
captured for them.

At the time of these runs the weekly all-models window was already at 79–80%
with two days to reset, which is the practical reason to keep iterating on the
cheap tier.

## What this does not establish

One eight-case fictional set does not choose a permanent summarizer. Identical
scores across four models mean this set no longer separates them; a harder set
would be needed to tell tiers apart, and that is a reason to distrust the set for
model choice, not evidence that model choice does not matter. It does not
test real source parsing, a long real day against the model input limit, Chrome
collection, scheduling, or report edits. The harness does not save raw model
replies, so these runs cannot be re-read; a specific case must be re-run to
inspect its output. No real day has been summarized.
