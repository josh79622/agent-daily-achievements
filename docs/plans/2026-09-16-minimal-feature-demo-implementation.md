# Minimal Feature Demo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the decorative demo page with a compact daily-report workflow.

**Architecture:** Leave report generation, local storage, API calls, and browser rendering intact. Simplify the HTML and CSS around the existing element IDs, and add a date input as the first visible workflow step.

**Tech Stack:** Semantic HTML, responsive CSS, browser TypeScript, Node.js test runner

---

### Task 1: Define the minimal workflow contract

**Files:**
- Modify: `test/web/build-output.test.ts`

1. Require `type="date"`, `Generate sample report`, `Fictional preview`, and `id="report-view"` in the built output.
2. Assert the built output does not contain prior dashboard copy including `Today’s proof` and `Collected gently in the background`.
3. Run `npm test -- test/web/build-output.test.ts` and confirm failure.
4. Commit `test: define minimal report workflow`.

### Task 2: Implement the minimal page

**Files:**
- Modify: `web/index.html`
- Modify: `web/styles.css`
- Modify: `web/app.ts`

1. Render one compact workspace with a date input, generate button, quiet fictional-data disclosure, empty report state, report sections, and evidence links.
2. Preserve all current JavaScript IDs and requests. Set the date input to the sample date without changing the Stage 2 API behavior.
3. Add `.empty-state[hidden] { display: none; }` so a loaded report hides the empty state.
4. Run the focused test and `npm run check`.
5. Commit `feat: simplify daily-report demo`.

### Task 3: Inspect and record

**Files:**
- Modify: `docs/plans/2026-09-16-minimal-feature-demo-design.md`

1. Inspect the initial and generated report states at desktop and 390px.
2. Record the checks in the design document.
3. Commit `docs: verify minimal feature demo`.
