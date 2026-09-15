# Synthetic day 01 review

The expectations in `../synthetic-day-01.md` were committed before either model ran. Both models received the exact same `../shared-prompt.md`, containing fictional records only. This compares the Claude Code and Codex CLI routes as well as their requested models; it is not a controlled API-only model comparison.

| Check | Claude `sonnet` alias | Codex `gpt-5.6-terra` |
| --- | --- | --- |
| Three required achievement items | 3/3 | 3/3 |
| False completion claims | 0 | 0 |
| Duplicate Atlas fix items | 0 | 0 |
| Source IDs on achievement items | 3/3 | 3/3 |
| Gemini failure and unknown activity disclosed | Yes | Yes |
| Exact `gemini-01` ID in coverage note | **Missing** | Present |

Claude's report made the right incomplete-data claim but omitted the exact Gemini source ID required by the predetermined rubric. Codex included it. Neither said the recruiter email was sent or that Posting A was applied to. Both treated the Claude Code discussion as a second source for the same Atlas fix, not a second fix.

The first Codex invocation never reached the model because the temporary directory selected a broken Homebrew Node binary. An explicit working Node 24 launcher ran the same prompt successfully. This is a concrete reliability risk for an unattended scheduler; it is not evidence of Codex model quality. The successful Codex wrapper reported 9,603 tokens used. The Claude text run did not capture comparable usage metadata, so cost cannot be scored from this test.

One short fictional day is insufficient to choose a permanent summarizer. It does not test actual source parsing, long histories, Chrome collection, real privacy handling, sleep/wake scheduling, or report edits. The next comparison should add conflicting and sparse-evidence cases, then use an explicitly approved real day after the provider boundary is settled.
