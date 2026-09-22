# Large payload chunking — design

## Goal

Generate one traceable daily report when a complete report-day payload is too
large for a single summarizer request, without silently omitting conversation
material.

## Decisions

- Every provider uses the same conservative input budget: approximately 64k
  tokens. The implementation must reserve room for the fixed prompt and a
  reply instead of treating 64k as an exact payload allowance.
- Pack complete sessions in chronological order. Only split a session when it
  alone exceeds the shared budget, and then split only between complete
  messages.
- Every sent message appears in exactly one chunk. Chunk metadata identifies
  its session and its position if that session was split.
- Each chunk is summarized against only its own evidence. Merge requests
  receive bounded intermediate summaries, not the original full-day
  conversations.
- The merge removes duplicate achievements, combines their evidence, and
  produces the existing 0–5 achievement report contract.
- The normal selected-provider, retry, and permitted-provider fallback rules
  apply to chunk and merge calls. Chunking never creates authority to send
  data to another provider.
- Every deterministic validation failure is re-analysed with the same provider
  and payload up to three attempts. A third invalid reply becomes incomplete
  and triggers the normal permitted-provider fallback.
- A failed chunk or merge saves an incomplete report with its local coverage
  and failure reason. It must never be represented as a complete daily report.
- A retry begins with fresh source collection and chunking; intermediate
  results from an earlier run are not reused.
- Message-level evidence is preferred. If carrying every message ID for one
  achievement would exceed the safe request budget, cite its containing
  session (`source` plus `recordId`) without `messageIds`. The local source
  view opens that whole session; no source content is discarded.

The shared-limit decision is recorded separately in
[2026-09-22-summary-payload-chunking.md](../decisions/2026-09-22-summary-payload-chunking.md).

## Data flow

```
complete day payload
  -> pack sessions into bounded chunks
  -> summarize each chunk with its local evidence manifest
  -> pack intermediate summaries into bounded merge groups (repeat as needed)
  -> resolve selected intermediate IDs to original evidence
  -> validate and save one AchievementReportV1
```

For a day that fits the safe budget, retain the current one-request path. This
avoids an unnecessary second model call and preserves the established behavior
for ordinary days.

Each intermediate merge carries compact opaque candidate IDs, not repeated
original message-ID lists. Its reply groups/selects those IDs; the server
deterministically unions their original evidence. Every merge input uses the
same shared budget, forming a bounded merge tree. Records and model replies
are delimited JSON data, never instructions.

## Failure behavior

- A chunk that cannot obtain a usable reply is recorded with its chunk/session
  identity and causes the final report to be incomplete.
- A chunk reply that fails the existing report validation is likewise
  incomplete; the existing limited re-analysis rules still apply where they
  already do.
- A merge reply that is unavailable or invalid produces an incomplete report,
  retaining chunk-level results only as internal diagnostic data rather than
  presenting them as a finished report.
- An oversized single message cannot be divided. It remains as one message in
  its own chunk; if that cannot fit the safe request budget, the report is
  incomplete with an explicit size reason rather than losing content.

## Test cases

| ID | Given | When | Then |
| --- | --- | --- | --- |
| CH-1 | A payload below the safe budget | It is generated | The existing single-request runner is used unchanged. |
| CH-2 | Several sessions that exceed one budget together | They are packed | Sessions remain chronological, each chunk stays within budget, and no session is split unnecessarily. |
| CH-3 | One session that exceeds the budget | It is packed | It splits only between messages; every message is present exactly once and in order. |
| CH-4 | One indivisible message above the safe budget | It is packed | No content is discarded; generation records an incomplete size failure. |
| CH-5 | Multiple chunk summaries citing original evidence | They are merged | Each final achievement cites only original evidence and duplicate achievements have combined evidence. |
| CH-6 | One chunk fails or returns invalid output | The day is generated | The saved report is incomplete and identifies the failed chunk/session. |
| CH-7 | All chunks succeed but merge fails | The day is generated | The saved report is incomplete; chunk summaries are not presented as a complete report. |
| CH-8 | A permitted fallback provider is needed | A chunk or merge runner fails | The existing permission and provider-fallback rules are preserved. |
| CH-9 | A retry starts after an earlier partial run | Generation runs again | It recollects and rechunks the original day rather than mixing old intermediate results. |
| CH-10 | An achievement's message-ID list exceeds the merge budget | It is prepared for a merge | It falls back to a session-level evidence reference; the full session remains traceable locally. |
| CH-11 | Many chunk summaries exceed one merge request | They are merged | They are packed into bounded intermediate groups until one final merge fits; no raw evidence list is duplicated across levels. |
| CH-12 | A record or candidate contains instruction-like text | It is placed in a prompt | It is explicitly delimited as untrusted JSON data, never as prompt instructions. |

## Verification

Use fake collectors and runners for CH-1 through CH-9. After the unit suite
passes, measure and run one user-approved large local day end to end. Confirm
the source count/message IDs before and after chunking, the stored report's
incomplete state when deliberately failing a chunk, and a complete report only
when every chunk and the merge validate.
