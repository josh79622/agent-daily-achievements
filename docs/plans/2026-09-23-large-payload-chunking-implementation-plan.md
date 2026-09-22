# Large Payload Chunking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce one evidence-traceable report for a large day by chunking it
at session/message boundaries, summarizing chunks, and merging their results.

**Architecture:** Keep `buildReportDayPayload` as the single consent-gated
source of day records. A pure `summary-chunking` module converts its parsed
conversations and manifest into bounded requests. `SummaryRunner` selects its
current single-request path for a small payload; otherwise it runs chunk
requests and one merge request, validating every model response against the
evidence it was allowed to see.

**Tech Stack:** TypeScript, Node built-ins, Vitest, existing local CLI runners.
Use a 128 KiB serialized-record budget for each request: it is a deliberately
conservative 2 bytes/token approximation under the shared ~64k-token policy,
including room for the prompt and reply. No tokenizer package is added.

---

### Task 1: Pure chunk representation and packing

**Files:**
- Create: `src/report/summary-chunking.ts`
- Test: `test/report/summary-chunking.test.ts`

**Step 1: Write failing CH-1 through CH-4 tests.**

Use synthetic serialized conversations and assert a small payload returns one
chunk; sessions pack in order without splitting; an over-budget session splits
only between messages; an indivisible over-budget message returns a typed
`message-too-large` failure. Assert every emitted chunk's `payloadJson` byte
length is at most `summaryChunkMaxPayloadBytes`, and flattening all chunk
manifests reproduces every original message ID once in order.

**Step 2: Run:**

`npm run test -- test/report/summary-chunking.test.ts`

Expected: FAIL because the module does not exist.

**Step 3: Implement the minimal pure module.**

Export:

```ts
export const summaryChunkMaxPayloadBytes = 128 * 1024;
export type SummaryChunk = {
  index: number;
  payloadJson: string;
  manifest: EvidenceManifest;
  sessionIds: readonly string[];
};
export type ChunkingResult =
  | { kind: "single"; chunks: readonly [SummaryChunk] }
  | { kind: "chunked"; chunks: readonly SummaryChunk[] }
  | { kind: "message-too-large"; source: ReportSource; recordId: string; messageId: string };
export function chunkReportDayPayload(payload: ReportDayPayload): ChunkingResult;
```

Parse only the payload's approved `{ date, conversations }` shape, construct
each candidate JSON with the same shape, and calculate bytes with
`Buffer.byteLength`. Preserve `source`, `recordId`, messages, and the matching
manifest entry. Put a whole session in the current chunk whenever possible;
otherwise start the next chunk. Only an individually oversized session is
rebuilt one message at a time. Do not truncate or reorder text.

**Step 4: Run the focused tests; expect PASS.**

**Step 5: Commit:**

`git add src/report/summary-chunking.ts test/report/summary-chunking.test.ts && git commit -m "feat(report): chunk oversized summary payloads"`

### Task 2: Chunk and merge prompt contracts

**Files:**
- Modify: `src/report/summary-prompt.ts`
- Test: `test/report/summary-prompt.test.ts`

**Step 1: Write failing tests** that prove a chunk prompt asks for qualifying
activities and only IDs in that chunk, while a merge prompt receives summaries
plus the full original evidence manifest and asks for 0–5 deduplicated final
achievements. Assert language selection applies to both prompts.

**Step 2: Run:**

`npm run test -- test/report/summary-prompt.test.ts`

Expected: FAIL for absent chunk/merge builders.

**Step 3: Implement** `buildChunkSummaryRequestText(chunk, options)` and
`buildMergeSummaryRequestText(chunkCandidates, manifest, options)`. Reuse the
existing achievement JSON schema and language instruction. The merge prompt
must state that it may cite only original evidence IDs from the supplied
manifest, never chunk IDs or invented IDs.

**Step 4: Run the focused tests; expect PASS.**

**Step 5: Commit:**

`git add src/report/summary-prompt.ts test/report/summary-prompt.test.ts && git commit -m "feat(report): add chunk and merge summary prompts"`

### Task 3: Run chunk summaries and merge them

**Files:**
- Modify: `src/summarizer/summary-run.ts`
- Modify: `src/report/contract.ts`
- Test: `test/summarizer/summary-run.test.ts`
- Test: `test/report/contract.test.ts`

**Step 1: Write failing CH-5 through CH-8 tests.**

Use the existing fake runner. Prove that: each chunk response is validated
against that chunk's manifest; a successful merge validates against the full
day manifest; a duplicate final activity is emitted once with combined
evidence; chunk failure or merge failure saves `incomplete`; and provider
fallback still occurs only through the existing app-level loop.

Add explicit contract entries for `summary-chunk-failed`,
`summary-merge-unavailable`, and `summary-message-too-large`, carrying only
safe identifiers/reasons needed by the local UI. Do not put conversation text
in error metadata.

**Step 2: Run:**

`npm run test -- test/summarizer/summary-run.test.ts test/report/contract.test.ts`

Expected: FAIL because the runner has only a single-request path.

**Step 3: Implement the runner path.**

Call `chunkReportDayPayload` before building a prompt. For `single`, retain
the existing attempt/retry behavior. For `chunked`, run each chunk through the
same provider/settings/attempt controls, collect only validated candidates,
then run exactly one merge request and validate it against the full manifest.
Save only the final `AchievementReportV1`; attach typed incomplete entries on
any unrecoverable chunk/merge result. Throw only when the existing provider
fallback contract requires it, so `app.ts` remains the sole owner of provider
ordering and permission.

**Step 4: Run focused tests; expect PASS.**

**Step 5: Commit:**

`git add src/summarizer/summary-run.ts src/report/contract.ts test/summarizer/summary-run.test.ts test/report/contract.test.ts && git commit -m "feat(summarizer): merge chunked daily summaries"`

### Task 4: Retry freshness and server regression coverage

**Files:**
- Modify: `test/summarizer/summary-run.test.ts`
- Modify: `test/server/summarizer-permission.test.ts`

**Step 1: Write failing CH-9 tests.**

Run the same date twice through a fake request factory whose source output
changes. Assert the second run receives newly built chunks, never cached chunk
responses. Assert a malformed/out-of-scope manifest still blocks generation
before any runner call.

**Step 2: Run:**

`npm run test -- test/summarizer/summary-run.test.ts test/server/summarizer-permission.test.ts`

Expected: FAIL until the new path has no intermediate-result cache and retains
the server permission gate.

**Step 3: Implement only any dependency injection needed to make freshness
observable.** Do not add persistent chunk storage.

**Step 4: Run focused tests; expect PASS.**

**Step 5: Commit:**

`git add test/summarizer/summary-run.test.ts test/server/summarizer-permission.test.ts src && git commit -m "test: cover fresh chunked summary retries"`

### Task 5: Full verification and approved real-day check

**Files:**
- Modify: `PROGRESS.md`
- Modify: `TODO.md`
- Create: `docs/research/2026-09-23-large-payload-chunking-verification.md`

**Step 1: Run the gate:**

`npm run check`

Expected: format, lint, both type checks, Vitest, and build all pass.

**Step 2: After Josh approves one real large day,** run the existing measured
generation path. Record its pre-chunk byte/message counts, chunk count and
byte sizes, selected/fallback provider, final report state, and whether every
reported evidence ID traces back locally. Do not record conversation text.

**Step 3: Update the verification document, `PROGRESS.md`, and `TODO.md` with
actual results only.**

**Step 4: Commit:**

`git add PROGRESS.md TODO.md docs/research/2026-09-23-large-payload-chunking-verification.md && git commit -m "docs: verify large payload chunking"`
