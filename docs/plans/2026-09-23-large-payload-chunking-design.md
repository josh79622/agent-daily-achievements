# Large payload chunking — design

## Goal

Generate one traceable daily report when a complete report-day payload is too
large for a single summarizer request, without silently omitting conversation
material.

## Decisions

- Every provider uses the same conservative prompt-input budget: approximately
  64k tokens. Chunk record packing reserves room for the fixed prompt and a
  conservative small structured-output allowance; a separate 512 KiB
  transport safety cap protects provider replies and is not charged to that
  prompt-input budget.
- Pack complete sessions in chronological order. Only split a session when it
  alone exceeds the shared budget, and then split only between complete
  messages.
- Every sent message appears in exactly one chunk. Chunk metadata identifies
  its session and its position if that session was split.
- Each chunk is summarized against only its own evidence. One final merge
  request receives compact chunk summaries, not the original full-day
  conversations.
- The merge removes duplicate achievements, combines their evidence, and
  produces the existing 0–5 achievement report contract. Its validation
  manifest is derived only from the compact candidate evidence sent to its
  prompt, never from records omitted during compaction.
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
  -> compact evidence to session references where necessary
  -> one final merge of compact chunk summaries
  -> validate and save one AchievementReportV1
```

For a day that fits the safe budget, retain the current one-request path. This
avoids an unnecessary second model call and preserves the established behavior
for ordinary days.

The final merge carries compact achievements. Their evidence keeps message IDs
when it fits the request budget and otherwise becomes a session-level
reference. If the one final merge would exceed the shared budget, save an
incomplete `merge-too-large` result; recursive merging is explicitly deferred.
Records and model replies are delimited JSON data, never instructions.

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
| CH-11 | Compact chunk summaries still exceed one merge request | They are merged | The saved report is incomplete with a merge-too-large reason; no recursive merge runs. |
| CH-12 | A record or candidate contains instruction-like text | It is placed in a prompt | It is explicitly delimited as untrusted JSON data, never as prompt instructions. |
| CH-13 | A merge reply cites a full-day record omitted from compact candidates | The merge reply is validated | It is rejected and retried; it is never saved as a completed report. |
| CH-14 | A valid evidence-heavy reply exceeds 8 KiB but is within 512 KiB | It is received | It is accepted; a reply beyond the transport cap remains unavailable. |

## Verification

Use fake collectors and runners for CH-1 through CH-9. After the unit suite
passes, measure and run one user-approved large local day end to end. Confirm
the source count/message IDs before and after chunking, the stored report's
incomplete state when deliberately failing a chunk, and a complete report only
when every chunk and the merge validate.
