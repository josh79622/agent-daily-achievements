# Calm Productivity UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Revise the dark Daily Proof demo into a calm, personal daily-review experience.

**Architecture:** Preserve all report generation, persistence, API, and rendering behavior. Update only the built-page contract, semantic page structure, presentation, and resting button copy.

**Tech Stack:** Semantic HTML, responsive CSS, browser TypeScript, Node.js test runner

---

### Task 1: Define the calm-productivity page contract

**Files:**
- Modify: `test/web/build-output.test.ts`

Replace console-specific assertions with visible language for the approved direction: `Good evening`, `Today's proof`, and `Private by design`. Run the focused test and confirm it fails against the existing developer-console page. Commit the failing test as `test: define calm productivity UI contract`.

### Task 2: Implement the calm daily-review interface

**Files:**
- Modify: `web/index.html`
- Modify: `web/styles.css`
- Modify: `web/app.ts`

Remove terminal, API endpoint, localhost, configuration-file, and monitoring language. Add a friendly greeting, concise privacy disclosure, three outcome summary cards, softer source coverage, a calm empty state, and readable report cards. Preserve all DOM IDs used by the browser script and all current request/render behavior. Run the focused test and complete `npm run check`. Commit as `feat: soften demo into a daily review`.

### Task 3: Inspect and record the revision

**Files:**
- Modify: `docs/plans/2026-09-16-engineer-ui-redesign-design.md`

Inspect desktop and 390-pixel layouts, generate a report in the browser, record the result, and commit as `docs: verify calm productivity revision`.
