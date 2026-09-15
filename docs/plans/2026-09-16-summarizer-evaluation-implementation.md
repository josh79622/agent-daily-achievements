# Synthetic Summarizer Comparison Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a reproducible English report comparison on one fictional day.

**Architecture:** Store synthetic source records, expected outcomes, and a shared prompt under `docs/evals/`. Run installed Claude Code and Codex CLIs from an isolated empty directory with tools disabled or read-only and session persistence off. Preserve the raw results and score them against the predetermined outcomes.

**Tech Stack:** Markdown fixtures; Claude Code CLI 2.1.226; Codex CLI 0.154.0. No application stack is selected.

---

### Task 1: Prepare the test

**Files:** Create `docs/evals/synthetic-day-01.md` and `docs/evals/shared-prompt.md`.

1. Assign stable source IDs to the five fictional source classes.
2. State three required items, the duplicate rule, the excluded email plan, and the Gemini incomplete-data warning before seeing model output.
3. Give both models identical English input and request source IDs for each report item.
4. Review the fixture against `BRIEF.md` and the approved evaluation design; commit the test definition.

### Task 2: Run both routes

**Files:** Create `docs/evals/results/synthetic-day-01-claude.md` and `docs/evals/results/synthetic-day-01-codex.md` from the exact returned responses using `apply_patch`.

1. Create an empty temporary directory with `mktemp -d` and record its explicit path for the run.
2. Run `claude -p --model sonnet --safe-mode --tools '' --no-session-persistence < /absolute/path/to/docs/evals/shared-prompt.md` from that directory. Capture the terminal output.
3. Run `codex exec --model gpt-5.6-terra --sandbox read-only --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check - < /absolute/path/to/docs/evals/shared-prompt.md` from that directory. Capture the terminal output.
4. If a route fails, record the failure without changing the predetermined expected answers. Do not send real source data.

### Task 3: Review and commit

**Files:** Create `docs/evals/results/synthetic-day-01-review.md`.

1. Score both results for required items, false completion, duplicate counting, source IDs, and incomplete-data disclosure. Note any output that cannot be scored.
2. State what this one synthetic day cannot establish. Avoid a permanent model-choice claim.
3. Run `git diff --check`, inspect the staged diff, and commit the results and review.
