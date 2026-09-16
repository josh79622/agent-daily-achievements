# Local agent source inventory — 2026-09-16

This is a read-only, metadata-only survey of local Claude Code and Codex records on Josh's Mac. It does not inspect or reproduce message content, prove that all records can be interpreted, or establish either source as supported by a collector. No conversation records were copied into this repository or sent to a summarization service.

| Source | Location | JSONL files | Approximate JSONL size | File modification-time range observed in initial survey |
| --- | --- | ---: | ---: | --- |
| Claude Code | `/Users/joshtsai/.claude/projects` | 102 | ~237 MiB | 2026-08-17 11:58:47 to 2026-09-16 08:30:19 AEST |
| Codex | `/Users/joshtsai/.codex/sessions` and `/Users/joshtsai/.codex/archived_sessions` | 61 active + 6 archived | ~170 MiB | 2025-10-12 22:31:29 AEDT to 2026-09-16 08:34:58 AEST |

All 102 Claude and 67 Codex JSONL files passed a whole-file JSON syntax read with `jq -e .` (output suppressed). This proves only that the currently readable lines parse as JSON. The dates above are filesystem modification times, **not** conversation dates or a claim of complete history. The Codex source was changing during verification: successive size totals increased from 178,175,542 to 178,238,841 to 178,247,672 bytes, and the newest active file's modification time advanced. Sizes are therefore approximate snapshots, not fixed totals.

## Observed record shapes

- Claude files are mixed event streams, not simply user/assistant messages. Sampled record `type` values include `user`, `assistant`, `attachment`, `file-history-snapshot`, `file-history-delta`, `ai-title`, `bridge-session`, `system`, `mode`, `permission-mode`, `queue-operation`, and `last-prompt`. Sampled user and assistant message records expose top-level `sessionId`, `timestamp`, `uuid`, and `message` fields. The nested `message` object has `role` and `content`; sampled assistant messages also expose `model` and `usage`.
- Codex files are also typed event streams. Sampled top-level fields include `type`, `timestamp`, and `payload`; sampled `response_item` payloads expose `role`, `type`, and `content`. Sampled record types include `session_meta`, `turn_context`, `response_item`, `event_msg`, `compacted`, `world_state`, and, in an archived file, `token_usage_record`. A sampled `session_meta` payload exposes a session identifier and `cwd`.
- The first Claude line carried a direct `sessionId` in 101 files and a `parentSessionId` in one agent-related file. These yielded 101 distinct IDs across 102 files. The one repeated ID belongs to a regular file and an agent-related file. This is evidence that file count is not session count; the relationship between their full event streams remains untested.
- Codex first-line `session_meta` identifiers yielded 66 distinct IDs across 67 files. The one repeated ID appears in two **active** session files, not in an active/archive pair. The reason and overlap remain untested.

## Consequences for the first collector slice

1. Enumerate files and parse event streams incrementally; the observed combined JSONL size is roughly 407 MiB and active files can grow while being read, so loading everything at once would be a poor default.
2. Use record timestamps to select a local calendar day, not file modification times. Define how absent or malformed timestamps are reported rather than quietly dropping events.
3. Keep source, session/file identity, and record identity available for source links and deduplication. A file-per-session assumption is already contradicted by the repeated IDs.
4. Distinguish conversation-bearing events from metadata, tools, attachments, and compacted state. Do not count every event as an achievement or infer completion from an intention.
5. Expose unreadable or uninterpretable source data as incomplete coverage. A JSON syntax pass alone is insufficient for source-support claims.

Still untested: actual day-boundary behavior, semantic parsing and deduplication, permissions over time, source-link opening, incremental updates, and failure handling. Chrome web Claude, ChatGPT, and Gemini were not surveyed in this task. Subsequent decisions chose Node.js LTS and a consent-gated daily data scope; their implementation and verification remain open.
