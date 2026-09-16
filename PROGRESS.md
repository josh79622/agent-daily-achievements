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

## Latest verification

- `npm run check` passed after the local collector panel change: format, lint, typecheck, 12 tests, and build.
- Browser inspection confirmed the local collector panel loaded metadata for both configured sources. Do not record conversation text or session contents in this file.

## Handoff

- Active worktree: `.worktrees/ui-skeleton`
- Branch: `codex/ui-skeleton`
- Local demo: `http://127.0.0.1:4317/`
- The server is running from the built worktree output. Restart it after server changes.
