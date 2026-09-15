# Agent Instructions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give Codex and Claude Code one maintained set of project rules.

**Architecture:** Put durable rules in `AGENTS.md` and a pointer in `CLAUDE.md`. Reference `BRIEF.md` for product requirements instead of repeating it.

**Tech Stack:** None; these are Markdown instruction files.

---

### Task 1: Write the canonical rules

**Files:** Create `AGENTS.md`.

1. Read `BRIEF.md` and the approved design record.
2. Write short English sections for orientation, approved decisions, evidence and privacy, working method, verification, and chronological commits.
3. Confirm no stack or external summarization service is implied as approved.

### Task 2: Add Claude Code pointer

**Files:** Create `CLAUDE.md`.

1. Point Claude Code to `AGENTS.md` and instruct it to read and follow that file before work.
2. Check the two files against `BRIEF.md` and the referenced AI-assisted development process.
3. Run `git diff --cached --check` and inspect the staged diff. Commit only these two files once the documentation check passes.
