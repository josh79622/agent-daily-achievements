# Progress

## Current phase

**Phase 3 — Consented local collection**

The project has moved past an experience-only prototype. A local collector demo now reads Claude Code and Codex JSONL records for the Australia/Sydney day, presents source/session metadata, and exposes an on-demand local preview endpoint. This is not yet a shippable collector because first-read consent, parser-correctness validation on real records, and explicit failure handling are unfinished.

## Completed

- Phase 1 foundation: `BRIEF.md`, canonical `AGENTS.md`, TypeScript skeleton, CI, and the `npm run check` gate.
- Phase 2 experience spike: the three-achievement constellation with expand/related interactions and narrow-screen layout.
- Phase 3 collector spike:
  - normalized Claude Code and Codex fixture parsing;
  - Sydney-date filtering, source/session identity, and malformed-line issue reporting;
  - metadata-first local API and browser panel;
  - local message preview fetched only after the user selects a session.

## Important boundaries

- The collector must not transmit records, persist conversation text, or commit private data.
- The current development demo reads Josh's local data only because he explicitly authorized this in the conversation. A product user must receive a local-source consent and scope choice before the first read.
- Consent to read local histories is separate from consent to transmit complete same-day conversations to a chosen Claude Code or Codex summarizer.

## Next task

Implement the first-read local-source consent gate: the page must require an explicit source-scope choice before the collector API is enabled, persist only the choice locally, and disclose that no conversation text leaves the machine. The task must not add model invocation or scheduling.

Josh confirmed the [consent design and acceptance cases](docs/plans/2026-09-16-local-source-consent-design.md), including an immutable source scope for each in-flight collection: a run completes with the scope saved when it began; source changes apply only to later runs. The task uses unit tests and the project quality gate; product-wide E2E tests are deferred until all planned functionality is complete. No private local history is used for tests.

## Latest verification

- Consent design only: targeted Prettier check and `git diff --check` passed. No application tests were run for this documentation change. The shell's default Node 25 fails to start because of a missing Homebrew library; use `/opt/homebrew/opt/node@24/bin` on `PATH` for the approved Node 24 runtime (verified v24.20.0).
- `npm run check` passed after the local collector panel change: format, lint, typecheck, 12 tests, and build.
- Browser inspection confirmed the local collector panel loaded metadata for both configured sources. Do not record conversation text or session contents in this file.

## Handoff

- Active worktree: `.worktrees/ui-skeleton`
- Branch: `codex/ui-skeleton`
- Local demo: `http://127.0.0.1:4317/`
- The server is running from the built worktree output. Restart it after server changes.
