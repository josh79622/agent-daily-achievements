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
blocks are normalized as message text. The built collector read the same three
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

## Open decision

An earlier metadata-only inventory found an agent-related Claude file that uses
`parentSessionId` rather than `sessionId`. The source has not been declared
supported until the product decides whether agent and sidechain records belong
in a daily report. That decision must define whether to exclude them, include
them as separate sessions, or merge them with a parent session. It will then
receive a dedicated synthetic test and read-only structural verification.
