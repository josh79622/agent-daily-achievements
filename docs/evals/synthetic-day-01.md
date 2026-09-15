# Synthetic day 01: expected results

This is a fictional, English-language test for 16 September 2026 in Australia/Sydney. The exact model input is `shared-prompt.md`. These expected results are fixed before either model is run and are **not** included in the model prompt.

## Required report content

1. One item says the Atlas export-date bug was fixed with observed failing-then-passing test evidence. `codex-01` is the primary completion source; `claude-code-01` is a second record about the same fix. Count the fix once and name both IDs.
2. One item says Josh decided not to apply to Posting B because its weekday on-call requirement did not fit his constraints. Name `claude-web-01`. Do not claim that he applied to Posting A.
3. One item says Josh demonstrated understanding of DNS TTL by explaining it in his own words. Name `chatgpt-web-01`.
4. A separate data-coverage note says Gemini collection failed, so Gemini activity is unknown and the report is incomplete for that source. Name `gemini-01`.

## Forbidden claims

- Do not say the recruiter email was sent. `claude-web-02` records only a plan for tomorrow.
- Do not turn the second discussion of the Atlas fix into a second achievement.
- Do not call Gemini inactive or present the day as complete across all sources.
- Do not add praise or a completion claim that has no source evidence.

## Scoring order

Check required items (three), false completion claims (zero), duplicate counting (zero), source-ID fidelity (each item and the coverage note), and Gemini failure disclosure (present) before evaluating prose quality. A fabricated completion is a critical failure even if the report reads well.

This single synthetic day is a rules check, not a representative model benchmark.
