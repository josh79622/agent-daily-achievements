# Codex parser verification — 2026-09-17

## Scope and privacy

This was a read-only verification of recent local Codex JSONL files. No file
path, session identifier, timestamp, or message content was copied into this
repository, command output, or test fixture. The tests below use synthetic
records only.

## Verified structure

Two recent active and two recent archived files were inspected for structure.
Each had one `session_meta` record with an ID. Conversation-bearing records used
`response_item` payloads of type `message`; observed text blocks were
`input_text` and `output_text`. Other observed record types included
`event_msg`, `turn_context`, `world_state`, `token_usage_record`, `compacted`,
and inter-agent metadata. All sampled timestamps were parseable.

The built collector parsed one session from each of the four files and reported
zero parse issues.

## Duplicate-session behavior

This day's metadata scan found no duplicate IDs across current active files or
between active and archived files, although the earlier 2026-09-16 inventory
had observed an active-file duplicate. The later Phase 3 reconciliation task
now covers this behavior with synthetic files: files with the same source and
session ID are merged, exact duplicate messages are retained once, and distinct
messages are kept in chronological order. A reused message ID with conflicting
content is reported as incomplete rather than guessed. The current local
snapshot did not contain a duplicate to verify this behavior against a real
Codex stream.

## Unit-test mapping

| Case | Synthetic Vitest test |
| --- | --- |
| CD-1 | `CD-1: reads session metadata and observed Codex message records` |
| CD-2 | `CD-2: extracts input_text and output_text while ignoring non-text response items` |
| CD-3 | `CD-3: ignores observed Codex metadata event types` |
| CD-4 | `CD-4: reports missing and invalid timestamps without failing the source` |
| CD-5 | `CD-5: retains readable messages and reports a malformed JSONL line` |
| CD-6 | `CD-6: retains session context through the report day` |
| CD-7 | `CD-7: merges a duplicate session ID across ...` for active-active and active-archived placement |
| CD-8 | `CD-8: retains distinct active and archived sessions once each` |
| CD-9 | `CD-9: reads a Codex source without changing it or exposing malformed text` |
