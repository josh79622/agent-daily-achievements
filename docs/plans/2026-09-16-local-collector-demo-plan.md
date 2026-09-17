# Local Collector Demo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Read today's local Claude Code and Codex sessions into a metadata-first, on-demand local preview.

**Architecture:** Add a collector module with source-directory configuration and JSONL parsers, injected into the HTTP app for fixture tests. The browser requests a summary and only fetches messages for a selected session; collected text remains in process memory.

**Tech Stack:** TypeScript, Node.js built-in filesystem/HTTP APIs, static HTML/CSS, Node.js test runner.

---

### Task 1: Define collector parsing behavior

**Files:**
- Create: `test/collector/local-collector.test.ts`

**Step 1: Write failing fixture tests**

Create temporary Claude Code and Codex JSONL fixtures with same-day user/assistant messages, unrelated metadata, a different-day message, and a malformed line. Assert normalized same-day sessions retain source and IDs while reporting the malformed line.

**Step 2: Run test**

Run: `npm test -- --test-name-pattern="local collector"`
Expected: FAIL because no collector exists.

**Step 3: Commit**

```bash
git add test/collector/local-collector.test.ts
git commit -m "test: define local collector behavior"
```

### Task 2: Implement the local collector

**Files:**
- Create: `src/collector/local-collector.ts`

**Step 1: Implement minimal parser**

Read configured JSONL files line-by-line, normalize conversation messages, group them by source/session, select the executing computer's local date, and expose parse issues without persisting content.

**Step 2: Run focused test**

Run: `npm test -- --test-name-pattern="local collector"`
Expected: PASS.

### Task 3: Expose metadata and local preview

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/index.ts`
- Modify: `test/server/app.test.ts`

**Step 1: Add failing API test**

Inject a fixed collector and require a summary endpoint plus an individual session-preview endpoint.

**Step 2: Implement routes**

Serve only summary metadata from the list route and selected messages from the preview route.

**Step 3: Run focused server test**

Run: `npm test -- --test-name-pattern="collector"`
Expected: PASS.

### Task 4: Add the local collector panel

**Files:**
- Modify: `web/index.html`
- Modify: `web/app.ts`
- Modify: `web/styles.css`
- Modify: `test/web/build-output.test.ts`

**Step 1: Write failing build contract**

Require collector panel and preview controls in built output.

**Step 2: Implement metadata-first browser UI**

Keep the constellation and add a discreet collector control/panel. Load source metadata on demand and request message text only after `Preview locally` is clicked.

**Step 3: Run full gate and commit**

Run: `npm run check`

```bash
git add src web test
git commit -m "feat: preview local agent sessions"
```

### Task 5: Inspect private local behavior without retaining content

**Files:**
- Modify: `docs/plans/2026-09-16-local-collector-demo-design.md`

**Step 1:** Browser-check metadata and one preview for both sources; do not copy message content into logs or docs.

**Step 2:** Run `npm run check`, record only verification counts/status, and commit.
