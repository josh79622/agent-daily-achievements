# Progress

## Current phase

**Phase 3 — Consented local collection**

The project has moved past an experience-only prototype. A local collector demo can read Claude Code and Codex JSONL records for the executing computer's local calendar day only after the user saves an explicit source choice. It presents source/session metadata and exposes an on-demand local preview endpoint. This is not yet a shippable collector because agent/sidechain source behavior, Codex parser validation, and explicit failure handling are unfinished.

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
- Phase 3 Claude Code parser verification, pending sidechain policy:
  - verified common real local JSONL structure read-only with no content retained;
  - added synthetic Vitest coverage for timestamp validity, BOM/CRLF input, structured content, malformed input, source read-only behavior, and report-day session context;
  - found a known agent-related `parentSessionId` shape whose daily-report behavior needs a product decision before the source can be called fully supported.

## Important boundaries

- The collector must not transmit records, persist conversation text, or commit private data.
- The current development demo reads Josh's local data only because he explicitly authorized this in the conversation. A product user must receive a local-source consent and scope choice before the first read.
- Consent to read local histories is separate from consent to transmit complete same-day conversations to a chosen Claude Code or Codex summarizer.

## Next task

Decide how daily reports treat Claude Code agent and sidechain sessions that use `parentSessionId`: exclude them, show them separately, or merge them with their parent. Then add a dedicated synthetic unit test and read-only structural verification before marking Claude Code parsing supported.

## Latest verification

- Claude Code parser checkpoint: `npm run check` passed with format, lint, typecheck, 39 tests, and build. A read-only structure-only check of three recent local files also passed; no content, identifiers, timestamps, or paths were retained. No E2E test was run; product-wide E2E testing is deferred until all planned functionality is complete.
- The shell's default Node 25 fails to start because of a missing Homebrew library; use `/opt/homebrew/opt/node@24/bin` on `PATH` for the approved Node 24 runtime (verified v24.20.0).

## Handoff

- Active worktree: `.worktrees/ui-skeleton`
- Branch: `codex/ui-skeleton`
- Local demo: `http://127.0.0.1:4317/`
- The server is running from the built worktree output. Restart it after server changes.
