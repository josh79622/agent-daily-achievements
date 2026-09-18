# Decision: content-blind truncation of bulk tool output in the report-day payload

Date: 2026-09-18. Decided by Josh in conversation.

## Context

`BRIEF.md` and `AGENTS.md` require that the chosen summarizer receive the day's
**complete conversations** up to the end of that day, and explicitly forbid
preselecting "relevant" excerpts.

Real Claude Code records contain `tool_use` and `tool_result` blocks
([parser verification](../research/2026-09-17-claude-code-parser-verification.md)).
Those blocks are the execution evidence that distinguishes a stated intention
from a completed task, so they belong in the payload. They are also the bulk:
one `Read` of a 500-line file is roughly 20,000 characters, so a day of agent
work can be mostly file bodies, with the achievement signal buried in output it
does not need. (Illustrative arithmetic, not a measurement of real data.)

## Decision

Bulk tool output is truncated before it leaves the machine, under three
conditions that keep this distinct from relevance-based preselection:

1. **Content-blind.** The cap never inspects what the text says. No judgment of
   relevance is made or implied.
2. **Uniform.** The same cap applies to every tool result, with no exceptions.
3. **Disclosed.** The payload states the omitted size at the omission point, so
   the summarizer knows it is reading a truncated result and cannot treat a cut
   file as a whole file.

The shape is **head + tail**: the first and last N characters of the result,
with the omitted character count between them. Head-only was rejected because a
test or build run puts its verdict at the end, so failures would be cut. `N` is
a named constant so it can be tuned.

### Amended 2026-09-18: `tool_use` is capped too

This record originally said `tool_use` inputs are never truncated because "they
are small and they are the evidence". Measurement disproved the premise. On one
real day, content divided as:

| Kind | Parts | Bytes | Share |
| --- | --- | --- | --- |
| `tool_result` | 563 | 1,055,714 | 40.8% |
| `text` (conversation) | 908 | 895,889 | 34.6% |
| `tool_use` | 563 | 638,429 | 24.6% |
| `image` | 15 | 260 | 0.0% |

`tool_use` averages 1,134 bytes per part, because an `Edit` or `Write` carries a
file's whole new contents rather than just a path. Two-thirds of the payload was
tool traffic and only a third was conversation.

Both tool kinds are therefore capped by the same constant under the same three
conditions. A truncated `tool_use` placeholder is no longer valid JSON inside its
brackets; that is acceptable, because it is a text placeholder and the omission
is disclosed. Measured effect on that day: 2.15 MB to 1.79 MB, about 610k to
510k estimated tokens, a 16.4% reduction against a predicted 17%.

## What this does not change

- **Nothing is lost from Josh's view.** The cap limits only what is sent. Source
  trace-back in the report UI points at the full local record.
- **Report status is unaffected.** A disclosed cap is not incomplete data, so it
  does not by itself make a report `incomplete`. Silent loss of content is a
  separate defect, tracked as the collector placeholder task in `TODO.md`.

## Rejected alternatives

- **Placeholder only, no result content.** Cheapest, and keeps proof that a tool
  ran and whether it succeeded, but loses what it found — including the error
  message that explains a day of debugging.
- **No cap.** Most literal reading of "complete", but spends most of the input
  budget on file bodies and pushes the whole problem into input-limit splitting.
