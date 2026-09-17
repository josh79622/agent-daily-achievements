# TODO

## Phase 3 — Consented local collection

- [x] Define a shared local session/message/issue model for Claude Code and Codex fixtures. (`951bb03`)
- [x] Add a metadata-first local collector panel and on-demand preview API. (`976cb44`)
- [x] Require explicit first-read consent and source scope before collector access. (`3a4946d`, `85e1ee9`, `30b6985`)
  - Josh confirmed the scope, tests, and immutable in-flight collection behavior in [the consent design](docs/plans/2026-09-16-local-source-consent-design.md). The task passed its unit tests and `npm run check`; no E2E test was run.
- [x] Use the executing computer's timezone for local collector date boundaries. (`d4ee881`)
  - TZ-1 through TZ-4 in `test/collector/local-timezone.test.ts` passed with synthetic records; no E2E test was run.
- [x] Migrate all unit tests to Vitest as the project's single runner. (`62dc887` and follow-up commit)
  - Existing behavior is preserved in 29 passing Vitest tests; no E2E test was run.
- [x] Verify Claude Code parsing against approved real local sessions: timestamps, role/content extraction, session identity, partial/malformed input. (`58035cc` and follow-up commits)
  - Common primary-session and fork-context structure passed read-only verification and CC-1 through CC-12 synthetic unit tests; see [the verification record](docs/research/2026-09-17-claude-code-parser-verification.md). No E2E test was run.
- [x] Verify Codex parsing against approved real local sessions: timestamps, role/content extraction, session identity, active/archived overlap, partial/malformed input. (`de44eb0` and follow-up commit)
  - Recent active and archived structure passed read-only verification and CD-1 through CD-9 synthetic unit tests; see [the verification record](docs/research/2026-09-17-codex-parser-verification.md). No E2E test was run.
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
