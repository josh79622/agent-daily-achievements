# First-read local-source consent — proposed design

Status: Josh approved this design and cases C1–C8 in the task conversation. Implementation uses synthetic histories for verification.

## Observable task

Users cannot control the first local history read → users explicitly choose Claude Code, Codex, both, or neither before the collector can access history files, and can change that choice later.

Acceptance: without consent, opening the page or directly requesting collector metadata or previews causes zero source-directory enumeration or history-file reads; after consent, only selected sources are accessed.

## Alternatives

1. **Recommended: server-enforced consent, persisted in ignored local JSON.** Survives browser and server restarts, covers direct API requests, and fits the skeleton's existing storage approach. Requires handling invalid settings and write failures explicitly.
2. **Server-enforced consent for the current process only.** Avoids a settings file but asks again after every restart and does not meet the handoff's persistence requirement.
3. **Browser-only consent.** Simple to display, but cannot enforce source access at the collector API boundary. Rejected as insufficient.

The proposed JSON settings file is for this local skeleton; it does not settle production storage or conversation retention.

## User flow and scope

- Show separate, initially unchecked Claude Code and Codex controls before collection. Do not inspect source directories to populate this screen.
- Explain that selected local histories across projects may be scanned to find activity on the requested Australia/Sydney date. Metadata appears first; message previews appear only on request. Do not imply that identifying a day's activity requires reading only that day's records.
- Disclose: conversation text stays on this machine, is not saved by this collector, and is not sent to an AI provider. External summarization requires separate consent later.
- An explicit save action stores the choice; choosing neither leaves collection disabled. Opening the panel or checking a box alone does not grant consent.
- Keep a source-settings control available before and after a collection. A collection takes an immutable snapshot of the saved source choice when it starts and runs to completion; its choice cannot be changed while it is running. After it completes, the user may choose the scope for the next collection. Choosing neither leaves a future collection disabled. Show an unselected source as not authorized, without claiming it is absent or inactive.
- Completed local metadata and previews remain available in the current page. A later source choice affects only the next collection; this task does not provide retroactive withdrawal or deletion of completed local work.

## Enforcement and persistence

- Keep one authoritative consent state in the local server. Both metadata and preview routes take the saved scope before source access; filtering responses after reading both sources is insufficient. Lock source-changing requests while a collection is in flight, so one run always uses its starting scope.
- Persist only a versioned source choice under ignored `data/`, with no conversation contents, source paths, session IDs, or provider authorization. Use atomic replacement so a partial write cannot become consent.
- Missing settings mean consent is required. Invalid or unreadable settings block collection and show a settings error instead of silently granting access.
- A failed save must never enable a newly requested source. Keep collection blocked until a valid choice is successfully saved; explain the failure in the page.
- Validate source names and input shape. Consent-changing requests must originate from the local app and use its expected JSON request format; a foreign webpage cannot grant consent through a form submission or cross-origin request. Validate the local request host as well.
- The existing collector remains responsible for parsing selected sources. Parser correctness, absent/unreadable-source classification, and deduplication remain separate Phase 3 tasks.

## Acceptance cases derived from the brief and handoff

All cases below are **confirmed by Josh**. They were written before inspecting implementation code for this task.

| ID | Scenario | Expected observable result |
| --- | --- | --- |
| C1 | First launch, page load, panel open, direct metadata request, or direct preview request without a saved choice | Consent controls start unchecked; collector access is denied; neither source is enumerated or read. |
| C2 | Explicitly save Claude Code only, Codex only, or both | Only selected sources can be enumerated/read and returned by metadata or preview routes. Unselected source previews are denied even if their IDs are known. |
| C3 | Save neither source, or dismiss settings without saving | No source access; sample report UI remains usable. Unsaved checkbox changes never authorize collection. |
| C4 | Reload the page and restart the server after saving | The selected scope survives; the settings file contains only the versioned choice. Loading settings does not itself trigger collection. |
| C5 | A collection is in flight and an attempt is made to change its sources | The change is refused until the collection completes. The in-flight collection uses exactly the scope saved when it started; after completion, a new choice applies only to the next collection. |
| C6 | Settings are malformed, unreadable, or cannot be saved | Collection stays blocked, the error is visible, and there is no automatic authorization or scope expansion. Successful explicit save restores access only to the saved scope. |
| C7 | Submit unknown sources, malformed consent input, or a consent write from an unrelated website/host | The request cannot change authorization or trigger source reads. |
| C8 | Inspect the consent flow and its filesystem/network effects with synthetic histories | Disclosure distinguishes local reads from external summarization; no history text is persisted or sent externally; metadata precedes on-demand previews. |

## Implementation and verification after approval

Write a small implementation plan, then translate the confirmed cases into unit tests using temporary synthetic source directories and consent files. First observe the expected failing tests and preserve them in a focused test commit; implement the minimal gate in a later commit. Review the server boundary, storage failure behavior, and immutable in-flight scope. Run `npm run check` and inspect its actual output. Update `PROGRESS.md` and `TODO.md` with results and focused commits. Do not use private conversation records as test fixtures. End-to-end tests belong to the completed product, not this task.

No model invocation, scheduling, new framework, or parser redesign is part of this task.
