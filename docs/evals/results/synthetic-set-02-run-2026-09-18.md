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

## Case 05 is unstable, and one run per model cannot score it

After the prompt change in `5236667`, a full haiku run still failed case 05, but
the same case passed when re-run alone moments later. Repeating case 05 on haiku
gave these results:

| Prompt | Runs | Passed |
| --- | --- | --- |
| Before `5236667` | 6 | 0 |
| After `5236667` | 7 | 3 |

The before row is one full-set run plus five deliberate baseline repeats; the
after row is one full-set run plus six repeats. The baseline repeats were run by
checking out the previous prompt, running, and restoring it.

Two consequences:

1. The prompt change is suggestive but not established. Zero of six against
   three of seven is a one-sided Fisher probability near 0.12, so this could
   still be chance. It is not a fix and is not recorded as one.
2. The four-model table above rests on one run per model. Case 05 is a coin flip
   on at least one model, so that table cannot separate a model's ability from
   its luck on this case. Any later model comparison on this set needs repeated
   runs per case, not one.

The other seven cases have not been repeated, so their stability is unknown.

## Prompt iteration on case 05, measured by repetition

Each variant was measured by repeating case 05 on Claude Code `haiku`. The
variants are cumulative.

| Prompt variant | Case 05 runs | Passed |
| --- | --- | --- |
| Original | 6 | 0 |
| Rule 4 scope + rule 6 "cites every record" (`5236667`) | 7 | 3 |
| Rule 2 redefines "evidence"; rule 6 becomes group-then-write | 8 | 3 |
| Schema annotation on the evidence field + a final re-scan step | 8 | 8 |

The first two rewrites argued the rule better and changed nothing measurable
(3/7 then 3/8). What moved the result was placement rather than argument: an
annotation on the `evidence` field inside the output schema, and a last line
after the schema telling the model to re-read every record and add any that
refers to the same work before emitting JSON. Against 3 of 8 for the previous
variant, 8 of 8 is a one-sided Fisher probability near 0.004.

The full eight-case set was then run twice on haiku with the final prompt: 8/8
both times, zero critical failures, and no case regressed. Case 06 returned zero
achievements in both runs where earlier runs returned one; that case requires
none and forbids only citing the fix without the contradiction, so both are
passes.

The re-scan step costs latency: case 08 took 48s and 79s against about 23s
before, and the whole set runs slower. No token figure is available per run.

Limits of this result: it is haiku only, on one case that was unstable, with the
other seven cases each observed twice. The three other models have not been run
against the final prompt, so the earlier four-model table now describes a prompt
that no longer exists.

## The final prompt on Codex

Codex `gpt-5.6-luna`, the cheapest model tried, ran the full set once on the
final prompt: 8/8, zero critical failures. Case 05 was then repeated eight times
on the same model and passed eight times, matching haiku.

The fix is therefore not specific to one provider: the same case went from a
single-run failure on all four models to 8/8 on both cheap models. Codex did not
pay haiku's latency cost, running 6–21s per case against haiku's 12–79s, and it
still reports the optional case 02 lint item where Claude Code omits it.

Still unmeasured on this prompt: `gpt-5.6-terra` and `sonnet`, and every case
except 05 has been repeated at most twice.
