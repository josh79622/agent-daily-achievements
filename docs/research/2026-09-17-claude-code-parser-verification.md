# Claude Code parser verification — 2026-09-17

## Scope and privacy

This was a read-only verification of a small sample of local Claude Code JSONL
files. No file path, session identifier, timestamp, or message content was
copied into this repository, command output, or test fixture. The tests below
use synthetic records only.

## Verified common structure

Three recent files were inspected for structure only. Their user and assistant
records used a top-level `sessionId` and UTC `Z` timestamps. Conversation
content occurred both as strings and as block arrays. Observed block kinds
included `thinking`, `tool_use`, `tool_result`, `text`, and `image`; only text
blocks were normalized as message text.

**Superseded on 2026-09-18 by Task NT** in
[the payload design](../plans/2026-09-18-report-day-payload-design.md): every
block kind except deliberation now keeps a visible placeholder, because dropping
`tool_use` and `tool_result` removed the execution evidence that separates a
stated intention from a completed task, and an image-only message vanished while
the day still reported `state: "available"`. CC-7 was updated to the new
behavior. The built collector read the same three
files and returned at least one session with zero reported parse issues.

## Unit-test mapping

| Case | Synthetic Vitest test |
| --- | --- |
| CC-1 | `CC-1: reads real-shape user and assistant records through the report day` |
| CC-2 | `CC-2: keeps one Claude session identity and chronological message order` |
| CC-3 | `CC-3: ignores real-shape non-conversation events` |
| CC-4 | `CC-4: retains valid messages and reports a malformed record` |
| CC-5 | `CC-5: reports valid JSON records that have missing or invalid timestamps` |
| CC-6 | `CC-6: includes prior context only for a session active on the report day` |
| CC-7 | `CC-7: extracts text blocks while ignoring non-text real-shape content blocks` |
| CC-8 | `CC-8: accepts a BOM and CRLF-terminated Claude JSONL file` |
| CC-9 | `CC-9: aggregates multiple malformed records without mistaking them for no activity` |
| CC-10 | `CC-10: reads a source without changing it or exposing malformed source text` |
| CC-11 | `CC-11: ignores a fork context reference and retains the direct session` |
| CC-12 | `CC-12: excludes agent and sidechain records that only have a parent session ID` |

## Fork-context verification

The one file previously observed with `parentSessionId` contains a non-message
`fork-context-ref` record and also contains direct `sessionId` conversation
records. A second read-only check verified that the collector ignores the fork
reference and preserves the direct session with zero reported parse issues.

Future parent-only conversation records are excluded as separate sidechain
sessions to avoid duplicate counting. CC-12 tests that safety behavior with a
synthetic record; it was not claimed to have occurred in the inspected sample.
