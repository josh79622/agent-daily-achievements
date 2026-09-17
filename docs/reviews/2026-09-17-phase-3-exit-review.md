# Phase 3 exit review — consented local collection

## Result

Phase 3 is complete for its planned scope: the local development tool can
collect supported Claude Code and Codex records only after a user saves an
explicit local-source choice. This is not a first-version release claim. The
Chrome sources, report generation, report correction, scheduling, notification,
fresh-user installation, and release checks remain in later phases.

## Evidence reviewed

| Area | Evidence | Result |
| --- | --- | --- |
| Consent before first read | Consent-gate unit tests and server implementation | A saved, valid local source choice is required before collection or preview. Missing, invalid, unreadable, or unwritable settings fail closed. A collection keeps its saved scope while it runs. |
| Claude Code structure | Read-only structural check of three recent local JSONL files; CC-1 through CC-12 synthetic Vitest cases | Common primary-session records, text blocks, malformed input, report-day context, and the observed fork-context record are supported. Parent-only sidechain sessions are excluded to prevent duplicate counting. |
| Codex structure | Read-only structural check of two recent active and two recent archived JSONL files; CD-1 through CD-9 synthetic Vitest cases | Observed `session_meta` and message payload structures, non-message metadata, malformed input, report-day context, and active/archive placement are supported. |
| Source coverage | IC-1 through IC-6 synthetic Vitest cases and collector/API display behavior | Each selected source can be shown as available, not installed, no activity, or incomplete with a reason. A second source's usable data remains visible when another is incomplete. |
| Repeated session files | DD-1 through DD-6 synthetic Vitest cases | Files with the same source and session ID merge. Exact duplicate messages appear once, distinct messages are chronological, and conflicting message IDs mark coverage incomplete. Source boundaries remain separate. |
| Date boundary | Approved cross-day decision and parser/dedup synthetic cases | A daily run uses the report day as a half-open interval: a session is included only when it has report-day activity, then retains its earlier context through the start of the next day. |

The parser verification records preserve only structural observations. They do
not retain local file paths, identifiers, timestamps, or conversation content:
[Claude Code verification](../research/2026-09-17-claude-code-parser-verification.md)
and [Codex verification](../research/2026-09-17-codex-parser-verification.md).

## Supported now

- A local user can explicitly select Claude Code, Codex, or both before the
  tool reads their local JSONL records.
- The collector normalizes the verified common message structures into local
  sessions and can show metadata before an on-demand local preview.
- A source that is absent is distinct from a source with no activity or a
  source that could not be fully read.
- Repeated Claude Code or Codex session files are reconciled only inside the
  same source and session identity. Conflicting duplicate message identities
  remain visible as incomplete coverage.
- Collection is read-only and has no external summarization or transmission
  path in Phase 3.

## Limits and work deliberately left open

- Real-source checks covered the observed common shapes, not every historical,
  future, or corrupted file format. The duplicate-stream merge cases are
  synthetic because the current local snapshot had no duplicate session ID.
- The current Codex evidence did not establish a semantic message identifier
  for every observed record shape; future unexpected repeats must therefore be
  treated cautiously and remain covered by incomplete-source reporting when
  they conflict.
- The three Chrome web sources have not begun collection work and cannot be
  described as supported.
- There is no external-agent setup, consent, payload transmission, achievement
  summarization, semantic achievement deduplication, or report trace-back yet.
- No end-to-end test was run. Product-wide end-to-end testing is deferred until
  all planned functionality is complete, as agreed.

## Verification

On 2026-09-17, `npm run check` passed using Node 24.20.0: formatting, lint,
type checking, 10 Vitest files with 63 tests, and the production build. The
shell's default Node 25 is not usable in this workspace because a Homebrew
native library is unavailable; the approved Node 24 runtime remains required.
