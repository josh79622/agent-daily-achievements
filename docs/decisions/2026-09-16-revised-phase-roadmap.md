# Decision: revised delivery phases

## Decision

The project follows these phases:

1. Foundation
2. Experience spike
3. Consented local collection
4. Report intelligence
5. Report control
6. Daily automation
7. Release readiness

## Rationale

The initial UI is an experience spike, not a settled data integration. Local-source consent must precede product use of local histories. Report control comes before unattended automation so users can inspect, correct, and delete output before daily runs amplify errors.

Session/file identity deduplication belongs to local collection. Semantic deduplication of achievements belongs to report intelligence. The report-intelligence phase must define labelled evaluation cases before prompt iteration.

## Review

Claude Code reviewed the roadmap on 2026-09-16 using only the phase outline; no local conversation records were supplied. Its recommendations to move consent into Phase 3 and report control before automation were accepted. The current development collector demo is covered by Josh's explicit conversational authorization; this does not replace the future product consent gate.

## Amendment (2026-09-18)

At the Phase 4 exit review, Josh chose to close Phase 4 as scoped and move the
report-generation steps to the start of Phase 5: a server-side report-day
payload builder, a summarizer runner for the selected CLI, and a prompt
evaluated on the fictional set before one Josh-approved real day. Rejected:
keeping Phase 4 open for these steps. Phase 5 therefore produces real reports
before adding trace-back, editing, and retention. See the
[Phase 4 exit review](../reviews/2026-09-18-phase-4-exit-review.md).
