# TODO

## Phase 3 — Consented local collection

- [x] Define a shared local session/message/issue model for Claude Code and Codex fixtures. (`951bb03`)
- [x] Add a metadata-first local collector panel and on-demand preview API. (`976cb44`)
- [ ] Require explicit first-read consent and source scope before collector access.
- [ ] Verify Claude Code parsing against approved real local sessions: timestamps, role/content extraction, session identity, partial/malformed input.
- [ ] Verify Codex parsing against approved real local sessions: timestamps, role/content extraction, session identity, active/archived overlap, partial/malformed input.
- [ ] Surface absent source, unreadable source, unsupported shape, and partial-write state as distinct incomplete coverage.
- [ ] Add session-file deduplication so one resumed or repeated stream is not counted twice.
- [ ] Run the Phase 3 exit review and document which source behavior is actually supported.

## Later phases

### Phase 4 — Report intelligence

- [ ] Confirm user consent for external summarization separately from local-source consent.
- [ ] Detect available selected Claude Code/Codex CLI and represent failures without silent fallback.
- [ ] Define the report contract: at most three achievements, evidence links, incomplete coverage, and achievement-level deduplication.
- [ ] Expand the pre-labelled evaluation set before prompt iteration.

### Phase 5 — Report control

- [ ] Source trace-back in the report UI.
- [ ] Edit and remove incorrect achievements.
- [ ] Define and enforce local retention.

### Phase 6 — Daily automation

- [ ] Schedule exactly one daily report with idempotent catch-up after sleep/wake.
- [ ] Mark incomplete reports visibly.
- [ ] Add a clickable macOS notification.

### Phase 7 — Release readiness

- [ ] Document GitHub-source setup and failure guidance.
- [ ] Verify setup on a fresh macOS user environment.
- [ ] Design the optional Chrome add-on separately.
