# Progress

## Current phase

**Phase 4 — Report intelligence** (not complete)

Phase 3 passed its exit review. Phase 4 now has a separate external-summarization permission gate, a validated report contract with fictional evaluation cases, and local provider sign-in, readiness, model, and effort controls. No real summarizer runs against conversation content yet.

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
- Phase 3 session-file deduplication:
  - merges repeated or split files only within the same source and session ID;
  - preserves one exact duplicate message, merges distinct messages chronologically, and marks conflicting message IDs incomplete without guessing;
  - retains the report-day context rule after merging.
- Phase 3 exit review:
  - documented the evidence-backed local-source behavior, limitations, privacy
    boundary, and later work in [the exit review](docs/reviews/2026-09-17-phase-3-exit-review.md);
  - confirmed that Phase 3 does not claim a first-version release or support
    for the Chrome sources.
- Phase 4 external-summarization permission:
  - a separate, fail-closed local permission record stores the approved source
    scope, both permitted recipients, and optional CLI preference, without
    conversation contents;
  - the local API discloses the maximum permission before it is saved, defaults
    to Codex when both injected CLIs are usable, and permits a saved grant to
    cover scheduled fallback to Claude Code;
  - report-day conversation payloads must come from an injected server-side
    builder rather than a browser request; if each approved available runner
    fails, the API returns an incomplete result with both failure reasons. The
    current builder and runner are test-only; no real CLI is detected or
    invoked yet.

- Phase 4 report contract (2026-09-17/18):
  - 0–5 achievements with traceable evidence; malformed or over-limit output
    fails closed as incomplete; more than five triggers at most three attempts;
    status and coverage come only from local facts;
  - eight approved fictional evaluation cases and a deterministic scorer; no
    model has been run against them.
- Phase 4 provider readiness (2026-09-17/18):
  - sign-in controls, a zero-conversation readiness probe run only on request,
    and per-provider summary model and effort settings from fetched model
    lists with a built-in fallback; both real CLIs showed Ready, and Josh
    confirmed the real model and effort dropdowns.

## Important boundaries

- The collector must not transmit records, persist conversation text, or commit private data.
- The current development demo reads Josh's local data only because he explicitly authorized this in the conversation. A product user must receive a local-source consent and scope choice before the first read.
- Consent to read local histories is separate from consent to transmit complete same-day conversations to a chosen Claude Code or Codex summarizer.

## Next task

- Phase 4 exit review drafted in
  [the review](docs/reviews/2026-09-18-phase-4-exit-review.md). All four Phase 4
  items are checked, but no real report is generated yet. Josh must decide
  whether the payload builder, summarizer runner, and prompt work keeps Phase 4
  open (recommended) or starts Phase 5.

## Latest verification

- Report contract Task 5 (2026-09-18): 41 report tests and `npm run check`
  with 200 tests passed on Node v24.20.0 before the report contract and
  evaluation-set items were marked complete. Josh confirmed the real effort
  dropdown after restarting the dev server.
- Summary effort setting Task P3: `npm run check` passed with 200 tests; all
  effort tests use fake lists or runners; the dropdown was viewed in the
  browser pane against fake lists. No real CLI received an effort option.
- Summary model setting real check (2026-09-17): after restarting the dev
  server, both providers showed fetched model lists without a fallback note,
  and a selection was saved through the dropdown.
- Summary model setting Task P2: `npm run check` passed with 189 tests; all
  catalog, settings, endpoint, and panel tests use fake lists or runners; the
  dropdown was viewed in the browser pane against fake lists.
- Readiness probe real check (2026-09-17): Josh clicked Check readiness on the
  running dev server, which had reloaded the P1 code; Codex and Claude Code both showed Ready. Which attempt
  passed, tool-disable effectiveness, and real failure paths remain unverified.
- Readiness probe Task P1: `npm run check` passed with format, lint,
  typecheck, 168 tests, and build. All probe, state, endpoint, and panel tests
  use fake runners or a fake service; the panel was viewed in the browser pane
  against a fake service. No real Codex or Claude Code probe has run.
- UI-first login demo (`docs/plans/2026-09-17-ui-first-cli-login-demo.md`): `npm run check` passed with format, lint, typecheck, 101 tests, and build. Provider CLIs were exercised only through `--help`; no real login, status, or probe command was run. The panel was viewed in the browser pane against a fake provider service. Josh then ran the manual demo for both providers: signed-out and signed-in states and the Terminal-launched browser login passed for Codex and Claude Code.
- Phase 3 exit review: `npm run check` passed with format, lint, typecheck, 63 tests, and build. DD-1 through DD-6 use only temporary synthetic source files because the current local snapshot has no duplicate session ID. No E2E test was run; product-wide E2E testing is deferred until all planned functionality is complete.
- The shell's default Node 25 fails to start because of a missing Homebrew library; use `/opt/homebrew/opt/node@24/bin` on `PATH` for the approved Node 24 runtime (verified v24.20.0).

## Handoff

- Active worktree: `.worktrees/ui-skeleton`
- Branch: `codex/ui-skeleton`
- Local demo: `http://127.0.0.1:4317/`
- The server is running from the built worktree output. Restart it after server changes.
