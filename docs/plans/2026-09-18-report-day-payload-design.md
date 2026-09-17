# Design: report-day payload and evidence manifest

Date: 2026-09-18. Phase 5, first item. **Not yet approved — test cases below
await Josh's confirmation before any test code is written.**

## What cannot be seen now → what will be visible when done

`/api/reports/generate` already requires the report-day payload to come from a
server-side builder rather than a browser request
([app.ts:512](../../src/server/app.ts:512)), but the only builder that exists is
a test fake. Nothing turns real collected sessions into summarizer input, and
nothing produces the `EvidenceManifest` that
[contract.ts](../../src/report/contract.ts) validates citations against.

When done: a server-side builder takes a date and an approved source scope,
calls the existing collector, and returns the exact payload text that would be
sent plus the matching manifest and local coverage — verified by unit tests,
with no CLI invoked and nothing transmitted.

## Approved decisions

- **Payload format: simplified, minified JSON** (Option A, chosen 2026-09-18).
  Measured against raw conversation text, minified JSON was the cheapest of the
  three candidates at every size tested (+6.5% to +13.9% structure, plus ~3.9%
  for escaping on code-heavy text); the earlier +23–50% figures were
  pretty-printing, not JSON. IDs stay in structural fields, so the day's own
  text cannot forge a record boundary.
- **Bulk tool output is capped head + tail**, content-blind and disclosed. See
  [the truncation decision](../decisions/2026-09-18-tool-result-truncation.md).
- **Non-text content becomes a visible placeholder** and no message may vanish
  silently.

## Task order

The collector change comes first, because the builder consumes its output shape.

- **Task NT — collector: represent non-text content.**
- **Task PB — server-side payload builder and manifest.**

## Task NT — collector: represent non-text content

Today `textFrom` keeps only `part.text` and discards every other block
([local-collector.ts:388](../../src/collector/local-collector.ts:388)). Verified
consequence: of four synthetic messages, an image-only message and a `tool_use`
message were dropped with `issues: 0` and `state: "available"` — a day reported
complete while content was missing.

`CollectedMessage` gains a `parts` array; `text` is kept as the joined form so
the existing preview UI and tests are unaffected:

```ts
type MessagePartKind = "text" | "image" | "tool_use" | "tool_result" | "other";
interface MessagePart { kind: MessagePartKind; text: string }
interface CollectedMessage { /* existing fields */ parts: MessagePart[] }
```

Placeholder forms (`text` parts are unchanged):

| Block | `kind` | `text` |
| --- | --- | --- |
| `image` | `image` | `[image image/png]` — media type only, never the bytes |
| `tool_use` | `tool_use` | `[tool_use Read {"file_path":"/x"}]` — input kept whole |
| `tool_result` | `tool_result` | `[tool_result ok]` or `[tool_result error]`, then the result content |
| unrecognized kind | `other` | `[<kind>]` |

**Design questions in this task (need approval):**

- **D1 — `thinking` blocks.** Recommendation: exclude them. They are internal
  deliberation, not observable progress, and they are large. Excluding them is a
  kind-based rule, not a relevance judgment about their content.
- **D2 — coverage reason vocabulary.** The collector reports
  `duplicate-conflict`, `duplicate-session` and `malformed-record`, which
  `ReportCoverage.reason` in the contract does not have. Recommendation: extend
  the contract's union to include them rather than flatten them into
  `collection-failed` and lose the reason in the report.

**Test cases:**

| ID | Case |
| --- | --- |
| NT-1 | an `image` block becomes a media-type placeholder part and never carries base64 data |
| NT-2 | a message whose only content is an image is kept, with the placeholder as its text |
| NT-3 | a `tool_use` block keeps its name and input verbatim in a `tool_use` part |
| NT-4 | a `tool_result` block records success or error, then its content, in a `tool_result` part |
| NT-5 | a `thinking` block is excluded, and a message left with no other part counts as an issue |
| NT-6 | a message with no representable content counts as an issue, so the source shows `incomplete` rather than `available` |
| NT-7 | an unrecognized block kind becomes a generic placeholder rather than being dropped |
| NT-8 | `text` remains the joined form of the parts, and existing session merging, ordering and report-day filtering are unchanged |

## Task PB — payload builder and manifest

```ts
interface ReportDayPayload {
  date: string;
  payloadJson: string;          // exactly what would be sent
  manifest: EvidenceManifest;   // derived in the same pass
  coverage: ReportCoverage[];   // local facts; NOT in payloadJson
  byteLength: number;
}
buildReportDayPayload(input: {
  collector: LocalCollector;
  date: string;
  sourceScope: readonly LocalSource[];
}): Promise<ReportDayPayload>;
```

Payload shape, one pass over `sessions[]`:

```json
{"date":"2026-09-18","conversations":[
  {"source":"codex","recordId":"0199a1b2-a1","messages":[
    {"id":"rollout-0199.jsonl:4","role":"user","time":"09:12","text":"…"}]}]}
```

- `CollectedSession.id` → `recordId`; `CollectedMessage.id` → message `id`. Both
  outputs come from the same loop, so the manifest always equals what was sent.
- Role words are written in full (`user` / `assistant`) rather than one letter.
  This costs about 1% more than the measured minified figure and is worth it for
  the model's comprehension.
- No `coverage`, `schemaVersion` or `timezone` inside the payload. Status and
  coverage come only from local facts in `assembleReport`, so sending them would
  hand the model something it must not influence.
- Per-message `time` is `HH:MM` local. The date is already known and
  `mergeSessions` has already sorted chronologically.
- Only `tool_result` parts are capped, head + tail, with the omitted character
  count disclosed between them. Conversation text is not capped.

**Deferred: splitting days over the model input limit.** With tool results
capped, a day's size becomes fairly predictable, so this is likely an edge case
rather than a core mechanism. `byteLength` is returned so the decision can be
made on a measurement. Measuring a real day needs Josh's approval and belongs
with the summary-run task.

**Test cases:**

| ID | Case |
| --- | --- |
| PB-1 | builds the approved shape, with no `coverage`, `schemaVersion` or `timezone` inside the payload |
| PB-2 | the manifest matches the payload exactly, and an evidence ref for every message in the payload validates |
| PB-3 | a record or message ID absent from the payload fails as `unknown-evidence` |
| PB-4 | coverage is returned separately, mapped from collector states, and appears nowhere in the payload |
| PB-5 | only sources inside the approved scope are collected and serialized |
| PB-6 | a session with no report-day activity appears in neither payload nor manifest |
| PB-7 | a `tool_result` part over the cap is truncated head + tail with the omitted count disclosed |
| PB-8 | a `tool_result` part at or below the cap passes through unchanged |
| PB-9 | a long conversation text part is not capped |
| PB-10 | truncation is content-blind: two different texts of equal length truncate at the same offsets |
| PB-11 | the same input builds a byte-identical payload twice, so all three re-analysis attempts reuse one payload |
| PB-12 | a day with no sessions yields empty conversations and an empty manifest, so any evidence fails validation |
| PB-13 | building transmits nothing and does not modify any source file |
