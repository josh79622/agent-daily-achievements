# Summary payload chunking

## Decision

When a report-day payload is too large for a single summarizer request, split
it using one **shared conservative input limit** for every supported provider.
Do not choose a different split boundary merely because the selected provider
or model advertises a larger context window.

## Why

Using one limit keeps the set of conversation material considered by the
pipeline stable when a user changes provider or when scheduled fallback moves
to another provider. It also gives the split/merge behavior one contract to
test and avoids treating an unverified provider context limit as a guarantee.

The existing content caps prevent individual tool parts from dominating a
payload, but they do not bound a whole busy day: the heaviest measured day is
still about 406k estimated tokens. Passing via stdin fixes operating-system
argument-length limits only; it does not fix model input limits.

## Consequences for the follow-up task

- Preserve complete report-day material by splitting at session boundaries;
  do not silently discard a tail to fit the limit.
- Summarize chunks with their source/evidence identifiers, then merge and
  deduplicate their results into the single daily report.
- If a chunk or merge fails, surface incomplete coverage rather than claiming
  a complete daily report.
- The numerical shared limit is intentionally not selected by this decision.
  It must be proposed from provider capability evidence and verified with
  synthetic oversized payloads and an approved real large day before release.
