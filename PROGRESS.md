# Progress

## Current phase

**Phase 3 — Consented local collection**

The project has moved past an experience-only prototype. A local collector demo can read Claude Code and Codex JSONL records for the Australia/Sydney day only after the user saves an explicit source choice. It presents source/session metadata and exposes an on-demand local preview endpoint. This is not yet a shippable collector because parser-correctness validation on real records and explicit failure handling are unfinished.

## Completed

- Phase 1 foundation: `BRIEF.md`, canonical `AGENTS.md`, TypeScript skeleton, CI, and the `npm run check` gate.
- Phase 2 experience spike: the three-achievement constellation with expand/related interactions and narrow-screen layout.
- Phase 3 collector spike:
  - normalized Claude Code and Codex fixture parsing;
  - Sydney-date filtering, source/session identity, and malformed-line issue reporting;
  - metadata-first local API and browser panel;
  - local message preview fetched only after the user selects a session.
- Phase 3 first-read consent gate:
  - server-enforced source choice stored as ignored local JSON with no conversation contents;
  - absent, invalid, unreadable, or unsavable settings fail closed;
  - a collection keeps its saved scope until completion, then later choices apply to a later collection;
  - source selection and disclosure in the local page; completed results remain until a later collection succeeds.

## Important boundaries

- The collector must not transmit records, persist conversation text, or commit private data.
- The current development demo reads Josh's local data only because he explicitly authorized this in the conversation. A product user must receive a local-source consent and scope choice before the first read.
- Consent to read local histories is separate from consent to transmit complete same-day conversations to a chosen Claude Code or Codex summarizer.

## Next task

Verify Claude Code parsing against approved real local sessions: timestamps, role/content extraction, session identity, and partial/malformed input. Before implementation or parser changes, propose the task's observable acceptance cases for Josh to confirm. Use approved real sessions only for read-only verification; do not retain their content in fixtures, logs, commits, or documentation.

## Latest verification

- First-read consent gate: `npm run check` passed with format, lint, typecheck, 25 tests, and build. The 12 consent-specific tests cover first-read blocking, scoped collection and previews, persisted settings, malformed/unreadable/save-failure states, request validation, and immutable in-flight scope. No E2E test was run; product-wide E2E testing is deferred until all planned functionality is complete.
- The shell's default Node 25 fails to start because of a missing Homebrew library; use `/opt/homebrew/opt/node@24/bin` on `PATH` for the approved Node 24 runtime (verified v24.20.0).

## Handoff

- Active worktree: `.worktrees/ui-skeleton`
- Branch: `codex/ui-skeleton`
- Local demo: `http://127.0.0.1:4317/`
- The server is running from the built worktree output. Restart it after server changes.
