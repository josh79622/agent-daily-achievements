# Project instructions

## Source of truth

- Read `BRIEF.md` before proposing or changing product behavior. It defines the goal, first-version scope, exclusions, and decisions still open. Do not treat this file as an approved architecture.
- Keep this file short and limited to rules that apply across tasks. Record the reasons for product or technical decisions in the relevant project document, not by expanding these instructions.
- The AI-assisted development process linked from `BRIEF.md` guides the workflow where available. If it conflicts with an explicit decision Josh makes for this project, follow the project decision and record it.

## Decisions and technology

- The first-version interface is approved as a local web page, and TypeScript is approved for first-version application code (local worker, web interface, and optional Chrome add-on); a Mac app is deferred until after first-version features are working. Use Node.js LTS for the main tool's runtime and start with GitHub source plus documented setup commands, not a required standalone executable. Installation asks the user for maximum external-summarization permission by default. With that permission, use the only usable agent CLI when there is one, allow the user to choose when both Claude Code and Codex are usable, and automatically try the other usable CLI if the initial choice fails. The interface must let the user adjust this permission. Framework, package manager, storage, extension tooling, exact installation commands, verification commands, CLI access details, model, report time, retention period, and source-collection details are not yet approved. Do not select them silently. Bring choices that would settle these questions to Josh with concrete trade-offs.
- The Stage 2 skeleton uses Node.js 24 LTS, npm, Vitest for unit tests, Node's built-in HTTP API, a framework-free browser page, and local JSON report files. This does not settle later production storage or extension tooling. Run the ordered gate with `npm run check`; it executes formatting, linting, type checking, tests, and the build.
- The initial public release supports macOS only and must have a fresh-user installation check before release; do not claim Windows or Linux support without separate design and verification. Do not add a cloud account, server, cross-device sync, or external processing of conversation contents without an explicit product and privacy decision.

## Evidence and privacy

- An achievement must describe observable progress, a decision, a clarification, or learning with a traceable source. A stated intention is not proof of completion; a web conversation without execution evidence cannot establish that a task was completed.
- Preserve links or identifiers back to original records. Avoid counting the same activity twice across sources. Make incorrect items correctable or removable by Josh.
- Support users with Claude Code only or Codex only. Show an absent local agent as not installed and optional add-on sources as not enabled when the add-on is absent or disabled; do not interpret either as a read failure or inactivity. When an installed or enabled source cannot be read, show the report as incomplete. Test each source and its failure behavior before describing it as supported.
- Chrome web conversations are collected only from use of the extension onward; do not backfill pre-installation history.
- Never commit conversation records, credentials, collected local data, or other private material. External AI summarization is approved only after the tool's user explicitly grants installation-time permission. For each daily report, include complete conversations with activity that day, up to that day's end; do not preselect relevance-based excerpts or resend the unrelated archive. Do not send before permission or interpret source installation as summarizer authorization. Maximum permission permits automatic fallback to the other usable summarizer CLI; the user may later adjust the permission through the interface.

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
