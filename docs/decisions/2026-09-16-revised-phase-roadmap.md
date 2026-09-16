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
