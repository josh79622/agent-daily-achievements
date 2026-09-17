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
- [x] Surface absent source, unreadable source, unsupported shape, and partial-write state as distinct incomplete coverage. (`738668a` and follow-up commit)
  - IC-1 through IC-6 distinguish not-installed, no-activity, and incomplete coverage with a reason, while preserving an available second source. No E2E test was run.
- [x] Add session-file deduplication so one resumed or repeated stream is not counted twice. (`163dc08` and follow-up commit)
  - DD-1 through DD-6 merge exact and split streams, retain source boundaries, and mark conflicts incomplete. The current local snapshot has no duplicate ID, so this behavior uses synthetic unit tests only; no E2E test was run.
- [x] Run the Phase 3 exit review and document which source behavior is actually supported.
  - The evidence-backed support boundary and remaining limitations are in [the Phase 3 exit review](docs/reviews/2026-09-17-phase-3-exit-review.md). No E2E test was run; product-wide E2E testing is deferred until all planned functionality is complete.

## Later phases

### Phase 4 — Report intelligence

- [x] Confirm user consent for external summarization separately from local-source consent.
  - The local API stores a fail-closed maximum-permission grant with approved
    source scope, both possible CLI recipients, and an optional CLI preference.
    Eight synthetic Vitest cases cover blocked requests, disclosure, default
    selection, scheduled fallback, both-runner failure, later
    permission/preference changes, server-built payloads, and recipient
    persistence. It does not detect or invoke a real provider yet.
- [ ] Detect available selected Claude Code/Codex CLI and represent failures without silent fallback.
  - UI-first login demo (`22a043c`, `3e2d7e3`, `c861af4`, `9237703`): a
    "Report sign-in" panel shows both providers, launches only the fixed
    `codex login` / `claude auth login` command in Terminal on macOS, and
    reports five safe states. Unit tests use fake executors only. Still open:
    Josh's manual Terminal demo, verifying that the real `login status` /
    `auth status` exit codes mean signed-in, and approval of a zero-conversation
    readiness probe (none is configured, so no provider can reach `ready`).
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
