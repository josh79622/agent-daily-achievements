# Local Collector Demo Design

## Goal

Make the next local-only slice observable: discover today's Claude Code and Codex conversations, show source coverage first, and let Josh expand an individual session to inspect its parsed messages locally.

## Boundary

The collector reads only the two local JSONL source directories already surveyed on this Mac. It uses record timestamps in the executing computer's local calendar day, not file modification times. It does not call a model, schedule work, notify the user, write conversation text to disk, or commit any collected content.

## Data model and API

Each normalized session exposes a source (`claude-code` or `codex`), stable session ID, source-file path, activity bounds, message count, parse issue count, and an in-memory list of parsed user/assistant messages. The HTTP endpoint returns a metadata summary by default. A session-preview endpoint returns that selected session's messages only on demand, from the same running process.

The collector parses JSONL incrementally. It keeps source and record identity so a later report can trace claims back to origin. Malformed lines, unreadable files, unsupported record shapes, and missing timestamps become visible source/session issues; they are never treated as no activity.

## Interface

The constellation remains the landing view. A discreet collector panel can be opened to show source coverage and today's sessions. Message text is absent until `Preview locally` is chosen for a session. Preview content stays in the running local process and page DOM only.

## Verification

Fixture JSONL files will prove both source parsers select the executing computer's local calendar day, ignore non-conversation records, preserve IDs, and expose malformed input as incomplete coverage. Browser verification will confirm that metadata loads first and a local session preview can be expanded without any outbound request.
