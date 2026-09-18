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

The shape is **marker + one window**, chosen per kind (amended 2026-09-18, see
below). The marker is always kept, then `N` characters of body: the **head** for
a `tool_use`, where the tool name and the file or command it acted on sit, and
the **tail** for a `tool_result`, where a run's verdict sits. `N` is a named
constant so it can be tuned.

Symmetric head + tail was the first shape and sent a third more for no gain.
Tail-only everywhere was considered and rejected: dropping the head would lose
the tool name on a `tool_use`, so a node could no longer distinguish a `Read`
from a `Write` from a `Bash`, and would lose the `ok`/`error` outcome on a
`tool_result`, which is precisely the difference between evidence of completion
and evidence of an attempt.

One assumption was measured and found false along the way: `tool_use` tails are
not closing JSON punctuation. Of 213 capped `tool_use` parts on a real day, 0 had
a tail that was mostly punctuation, because a `Write` ends with the end of real
file content. The tail is dropped because the head is worth more, not because the
tail is empty.

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
conditions. The constant was tightened from 500 to **250** head and tail on the
same day, on Josh's decision. 250 still holds a test or build run's closing
verdict in the tail and the file or command being acted on in the head, which is
where the evidence value is; 100 was measured as available if more is needed. A truncated `tool_use` placeholder is no longer valid JSON inside its
brackets; that is acceptable, because it is a text placeholder and the omission
is disclosed. Measured effect on that day, cumulative:

| Shape | Payload | Est. tokens |
| --- | --- | --- |
| `tool_result` only, head + tail 500 | 2.15 MB | 610k |
| both kinds, head + tail 500 | 1.79 MB | 510k |
| both kinds, head + tail 250 | 1.55 MB | 443k |
| both kinds, marker + one window 250 | **1.42 MB** | **406k** |

Overall these changes took the heaviest of 15 days down 33%, from 610k to 406k
estimated tokens, and the median day from 164k to 135k.

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
