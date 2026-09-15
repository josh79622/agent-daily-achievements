# Project instructions

## Source of truth

- Read `BRIEF.md` before proposing or changing product behavior. It defines the goal, first-version scope, exclusions, and decisions still open. Do not treat this file as an approved architecture.
- Keep this file short and limited to rules that apply across tasks. Record the reasons for product or technical decisions in the relevant project document, not by expanding these instructions.
- The AI-assisted development process linked from `BRIEF.md` guides the workflow where available. If it conflicts with an explicit decision Josh makes for this project, follow the project decision and record it.

## Decisions and technology

- The first-version interface is approved as a local web page; a Mac app is deferred until after first-version features are working. The technology stack, summarization agent or model, data-sharing boundary, report time, retention period, and source-collection details are not yet approved. Do not select them silently. Bring choices that would settle these questions to Josh with concrete trade-offs.
- Once the stack is approved, record its practical requirements here: runtime, framework, package manager, storage, extension tooling, and verification commands. Keep rationale and rejected alternatives in a decision record.
- This is a local-Mac first-version project. Do not add a cloud account, server, cross-device sync, or external processing of conversation contents without an explicit product and privacy decision.

## Evidence and privacy

- An achievement must describe observable progress, a decision, a clarification, or learning with a traceable source. A stated intention is not proof of completion; a web conversation without execution evidence cannot establish that a task was completed.
- Preserve links or identifiers back to original records. Avoid counting the same activity twice across sources. Make incorrect items correctable or removable by Josh.
- Show optional add-on sources as not enabled when the add-on is absent or disabled; do not interpret this as a read failure or inactivity. When an enabled source cannot be read, show the report as incomplete. Test each source and its failure behavior before describing it as supported.
- Chrome web conversations are collected only from use of the extension onward; do not backfill pre-installation history.
- Never commit conversation records, credentials, collected local data, or other private material. Do not send conversation contents to an external model or service before Josh approves that boundary.

## Working method

- Build small, reviewable tasks. State each task as “what cannot be seen now → what will be visible when done,” with an observable acceptance result.
- The earliest runnable skeleton may connect fewer sources, but it does not satisfy the first-version completion criteria in `BRIEF.md`.
- Derive important test cases from the intended behavior before looking to implementation for expected results; have Josh confirm cases that set product behavior. Use focused checks appropriate to the risk, and read their actual output before calling work complete.
- Once `PROGRESS.md` and `TODO.md` exist, update them at task or session boundaries so the next session can resume from files. Do not invent status files merely to claim progress.
- AI-written code is not automatically reviewed or verified by Josh. Explain new concepts in an overview first, then discuss one section at a time when Josh is learning or taking over a slice.

## Git history and completion

- Commit each meaningful task, fix, or intentional change. Keep commits focused and exclude unrelated edits. Documentation and rule changes are changes too.
- Keep the normal sequence of commits; do not squash away attempted work, failures, or corrections. Intermediate commits may be incomplete or failing when they preserve useful evidence, but their messages must describe that state honestly.
- After a failed check, record the focused correction in a later commit. Mark a task complete only after its relevant verification passes; an intermediate commit alone is not proof of completion.
- Review the diff and report the checks actually run. Never claim an unrun test passed.

## Maintaining these instructions

- `AGENTS.md` is canonical. Update it only when a durable working rule or approved practical stack changes. Keep `CLAUDE.md` as a pointer, with no duplicated rules.
