# Progress

## Current phase

**Phase 3 — Consented local collection**

The project has moved past an experience-only prototype. A local collector demo can read Claude Code and Codex JSONL records for the executing computer's local calendar day only after the user saves an explicit source choice. It presents source/session metadata and exposes an on-demand local preview endpoint. This is not yet a shippable collector because session-file deduplication is unfinished.

## Completed

- Phase 1 foundation: `BRIEF.md`, canonical `AGENTS.md`, TypeScript skeleton, CI, and the `npm run check` gate.
- Phase 2 experience spike: the three-achievement constellation with expand/related interactions and narrow-screen layout.
- Phase 3 collector spike:
  - normalized Claude Code and Codex fixture parsing;
  - local-timezone date filtering, source/session identity, and malformed-line issue reporting;
  - metadata-first local API and browser panel;
  - local message preview fetched only after the user selects a session.
- Phase 3 first-read consent gate:
  - server-enforced source choice stored as ignored local JSON with no conversation contents;
  - absent, invalid, unreadable, or unsavable settings fail closed;
  - a collection keeps its saved scope until completion, then later choices apply to a later collection;
  - source selection and disclosure in the local page; completed results remain until a later collection succeeds.
- Phase 3 local timezone:
  - collection uses the executing computer's system timezone rather than a fixed Sydney timezone;
  - timezone boundary, non-Sydney, and invalid-timezone behavior are covered by synthetic unit tests.
- Unit-test framework:
  - all existing unit tests use Vitest, with one `npm test` command and no `node:test` or `node:assert` imports in the test suite.
- Phase 3 Claude Code parser verification:
  - verified common real local JSONL structure read-only with no content retained;
  - added synthetic Vitest coverage for timestamp validity, BOM/CRLF input, structured content, malformed input, source read-only behavior, and report-day session context;
  - verified that a real `fork-context-ref` metadata record is ignored while the same file's direct session remains available; future parent-only sidechain conversations are excluded to avoid duplicate counting.
- Phase 3 Codex parser verification:
  - verified recent active and archived JSONL structure read-only with no content retained;
  - added synthetic Vitest coverage for observed message and metadata shapes, timestamp and malformed input, report-day context, duplicates, and source read-only behavior;
  - duplicate IDs produce an incomplete result rather than duplicate sessions; stream reconciliation remains a separate task.
- Phase 3 source coverage states:
  - distinguishes a source that is not installed, has no report-day activity, or has incomplete data from an unreadable path, unsupported format, partial write, malformed record, or duplicate session;
  - preserves available data from one source while showing another selected source's incomplete state in the local page and collector API.

## Important boundaries

- The collector must not transmit records, persist conversation text, or commit private data.
- The current development demo reads Josh's local data only because he explicitly authorized this in the conversation. A product user must receive a local-source consent and scope choice before the first read.
- Consent to read local histories is separate from consent to transmit complete same-day conversations to a chosen Claude Code or Codex summarizer.

## Next task

Add session-file deduplication so one resumed or repeated stream is not counted twice. Before implementation or parser changes, propose the task's observable acceptance cases for Josh to confirm. Use approved real sessions only for read-only verification; do not retain their content in fixtures, logs, commits, or documentation.

## Latest verification

- Source coverage states: `npm run check` passed with format, lint, typecheck, 57 tests, and build. IC-1 through IC-6 use only temporary synthetic source paths and files. No E2E test was run; product-wide E2E testing is deferred until all planned functionality is complete.
- The shell's default Node 25 fails to start because of a missing Homebrew library; use `/opt/homebrew/opt/node@24/bin` on `PATH` for the approved Node 24 runtime (verified v24.20.0).

## Handoff

- Active worktree: `.worktrees/ui-skeleton`
- Branch: `codex/ui-skeleton`
- Local demo: `http://127.0.0.1:4317/`
- The server is running from the built worktree output. Restart it after server changes.
