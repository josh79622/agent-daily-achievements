# Whitespace-First Demo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce the initial daily-report demo to its essential action and one discreet fictional-data disclosure.

**Architecture:** Keep the existing DOM IDs and report-rendering code intact. Simplify static HTML and CSS only, so local report generation and persisted report loading continue to work without new application logic.

**Tech Stack:** TypeScript, static HTML/CSS, Node.js test runner.

---

### Task 1: Define the quiet landing-state contract

**Files:**
- Modify: `test/web/build-output.test.ts`

**Step 1: Write the failing test**

Require `Fictional sample · local only` and assert that the verbose heading, preview paragraph, empty-state prose, and footer stage label are absent.

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="minimal daily-report"`
Expected: FAIL because the current built HTML includes the removed text.

**Step 3: Commit**

```bash
git add test/web/build-output.test.ts
git commit -m "test: define whitespace-first demo"
```

### Task 2: Simplify the landing markup and styling

**Files:**
- Modify: `web/index.html`
- Modify: `web/styles.css`

**Step 1: Write minimal implementation**

Keep the date input, generate button, error container, and report container. Remove static explanatory copy and use a spacious, border-light layout with just the compact disclosure.

**Step 2: Run focused test**

Run: `npm test -- --test-name-pattern="minimal daily-report"`
Expected: PASS.

**Step 3: Run full verification**

Run: `npm run check`
Expected: format, lint, typecheck, tests, and build all pass.

**Step 4: Commit**

```bash
git add web/index.html web/styles.css
git commit -m "feat: create whitespace-first demo"
```

### Task 3: Inspect the interactive demo

**Files:**
- Modify: `docs/plans/2026-09-16-whitespace-demo-design.md`

**Step 1: Open the local demo at desktop and narrow widths**

Confirm the initial action area is visually quiet and generate a report to verify the existing rendered content still appears.

**Step 2: Record verification**

Add the inspection result to the design document.

**Step 3: Run final verification and commit**

Run: `npm run check`
Expected: all checks pass.

```bash
git add docs/plans/2026-09-16-whitespace-demo-design.md
git commit -m "docs: verify whitespace-first demo"
```
