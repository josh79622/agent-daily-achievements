# Agent instruction files

## Decision

`AGENTS.md` is the single maintained rulebook for agents working in this repository. `CLAUDE.md` is a short pointer directing Claude Code to read and follow `AGENTS.md`.

The rulebook is written in English and stays short. `BRIEF.md` remains authoritative for product scope and unresolved product choices; the rulebook references it instead of copying it. The technology stack is explicitly unselected until Josh approves a decision. Once approved, `AGENTS.md` records the practical stack and required commands, while the rationale belongs in a separate decision record.

## Rules to include

The rulebook covers project orientation; evidence-backed achievement claims; visible source failures and user correction; local-first privacy; small, observable development tasks; verification appropriate to the change; and durable status documentation as those files are introduced.

Git history remains chronological and unsquashed to show attempted work, failures, and corrections. Intermediate commits may capture incomplete or failing states if labeled honestly. A task is marked complete only after relevant verification passes. Each discrete completed task, fix, or intentional change is committed, with unrelated or private local data excluded.

## Maintenance

Agents update `AGENTS.md` only when a durable working rule changes. `CLAUDE.md` remains a pointer and does not duplicate rules. Product decisions change `BRIEF.md` or an appropriate decision record rather than being silently added to agent instructions.

## Checks

Before committing the two instruction files, compare them with `BRIEF.md` and the referenced AI-assisted development process, inspect the diff, and verify that the pointer names the canonical file correctly. No automated test is needed for these documentation-only files.
