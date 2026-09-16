# Engineer UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the fictional Daily Proof demo as a dark, clean developer tool that shares the visual language of joshtsai.com.

**Architecture:** Keep the current domain, persistence, server, API, and browser data flow intact. Change only the built-page contract, semantic HTML, CSS presentation, and the small labels controlled by the browser script.

**Tech Stack:** Semantic HTML, responsive CSS, browser TypeScript, Node.js test runner, existing custom build script

---

### Task 1: Lock the engineer-facing page contract

**Files:**
- Modify: `test/web/build-output.test.ts`

**Step 1: Write the failing test**

Extend the build-output test to require the new product and developer-tool language:

```ts
assert.match(html, /Daily Proof\./);
assert.match(html, /localhost:4317/);
assert.match(html, /Integration status/);
assert.match(html, /Awaiting generation/);
```

Keep the fictional-data notice, generation control, and `report-view` assertions.

**Step 2: Run the focused test to verify it fails**

Run: `npm test -- test/web/build-output.test.ts`

Expected: FAIL because the existing editorial page does not contain the approved engineer-facing language.

**Step 3: Commit the failing contract test**

```bash
git add test/web/build-output.test.ts
git commit -m "test: define engineer UI contract"
```

### Task 2: Implement the Portfolio × Developer Console interface

**Files:**
- Modify: `web/index.html`
- Modify: `web/styles.css`
- Modify: `web/app.ts`

**Step 1: Replace the page structure**

Use a compact application header, developer-oriented hero, fictional-data notice, integration status row, console-like empty state, and structured report dashboard. Preserve every ID consumed by `web/app.ts` and all accessible labels.

Required visible language includes:

```text
Daily Proof.
localhost:4317
Integration status
Awaiting generation
Fictional data only
```

**Step 2: Replace the visual system**

Build the approved system around these tokens:

```css
:root {
  color-scheme: dark;
  --background: #0d1117;
  --surface: #121820;
  --surface-raised: #171e27;
  --text: #f0f3f5;
  --muted: #89929e;
  --accent: #33b6a0;
  --line: rgba(240, 243, 245, 0.1);
}
```

Use sans-serif typography for headings and copy, monospace for endpoints, dates, IDs, counters, and statuses. Use thin borders and subtle teal glow/grid details. Remove serif type, cream surfaces, paper illustrations, and rotated cards.

**Step 3: Keep browser labels consistent**

If the primary button label changes, update `setGenerating()` so its resting and loading states match the HTML. Do not change request paths, error handling, or rendering data flow.

**Step 4: Run the focused test**

Run: `npm test -- test/web/build-output.test.ts`

Expected: PASS.

**Step 5: Run the complete gate**

Run: `npm run check`

Expected: formatting, lint, typecheck, all tests, and build PASS.

**Step 6: Commit**

```bash
git add web/index.html web/styles.css web/app.ts
git commit -m "feat: restyle demo for engineers"
```

### Task 3: Inspect and document the result

**Files:**
- Modify: `docs/plans/2026-09-16-engineer-ui-redesign-design.md`

**Step 1: Run the committed build and server**

Run: `npm run build && npm start`

Expected: the app is available only at `http://127.0.0.1:4317`.

**Step 2: Inspect the rendered UI**

Verify the initial and generated states at desktop width and approximately 390 pixels. Confirm the fictional-data disclosure, primary action, integration statuses, report status, source IDs, and evidence trail remain readable.

**Step 3: Record verification and commit**

Add a short implementation-status note to the design document, then commit:

```bash
git add docs/plans/2026-09-16-engineer-ui-redesign-design.md
git commit -m "docs: verify engineer UI redesign"
```
