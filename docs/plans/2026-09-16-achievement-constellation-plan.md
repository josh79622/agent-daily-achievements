# Achievement Constellation Demo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Present three interactive fictional achievements as a spacious constellation with expandable details and related-event maps.

**Architecture:** Replace the report-page renderer with a small client-side graph model. HTML provides the canvas and date; TypeScript creates achievement and event nodes, manages expanded and related states, and CSS positions the graph plus its pointer response.

**Tech Stack:** TypeScript, HTML/CSS, Node.js test runner.

---

### Task 1: Define the constellation contract

**Files:**
- Modify: `test/web/build-output.test.ts`

**Step 1: Write the failing test**

Require the date, three achievement-node markers, `Expand`, and `Related`; reject the old sample-generation copy.

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="constellation"`
Expected: FAIL because the existing page is a report workflow.

**Step 3: Commit**

```bash
git add test/web/build-output.test.ts
git commit -m "test: define achievement constellation demo"
```

### Task 2: Render the fictional graph and node toggles

**Files:**
- Modify: `web/index.html`
- Modify: `web/app.ts`

**Step 1: Write minimal implementation**

Create three fictional achievement records with related event records. Render achievement nodes and event nodes dynamically; use two buttons on each node to toggle its description and its local related map.

**Step 2: Run focused test**

Run: `npm test -- --test-name-pattern="constellation"`
Expected: PASS.

### Task 3: Style the floating constellation

**Files:**
- Modify: `web/styles.css`

**Step 1: Write minimal implementation**

Use a dark, spacious canvas. Position achievement nodes without overlap, reveal controls on hover/focus, make expanded descriptions readable, and draw related-map connections with CSS. Add a subtle pointer transform and a narrow-screen stacked composition.

**Step 2: Run full verification**

Run: `npm run check`
Expected: format, lint, typecheck, tests, and build all pass.

**Step 3: Commit**

```bash
git add web/index.html web/app.ts web/styles.css
git commit -m "feat: add achievement constellation demo"
```

### Task 4: Inspect the interactive demo

**Files:**
- Modify: `docs/plans/2026-09-16-achievement-constellation-design.md`

**Step 1: Browser-check the demo**

At desktop and 390-pixel widths, hover an achievement, expand its description, show related events, and exercise an event node action.

**Step 2: Record verification and commit**

Run: `npm run check`

```bash
git add docs/plans/2026-09-16-achievement-constellation-design.md
git commit -m "docs: verify achievement constellation demo"
```
