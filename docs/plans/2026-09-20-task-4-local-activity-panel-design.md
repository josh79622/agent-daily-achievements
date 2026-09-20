# Task 4 — Local Activity & Raw Collector Inspection Panel Design

## Goal

Provide a clean, user-facing inspection interface within the Zen web UI for the local collector. Users can view and adjust local source consent (`claude-code`, `codex`, `antigravity`), inspect raw source coverage and discovered sessions for any selected calendar date, and expand individual session messages locally on demand without external network transmission.

## Context and Current Gap

In Phase 3, the local collector and its consent gate were implemented on the server:
- `GET /api/collector/consent`: retrieves consented local sources.
- `PUT /api/collector/consent`: saves user-approved source scope.
- `GET /api/collector/today?date=YYYY-MM-DD`: discovers sessions and source coverage for a specific calendar date.
- `GET /api/collector/sessions/:id?source=:source&date=YYYY-MM-DD`: on-demand fetches parsed messages for a single session.

During the React + Vite migration (Tasks 1–3), the old vanilla DOM panel (`web/app.ts`) was retired. While `ZenJournal.tsx` currently traces evidence messages for generated achievements, there is currently no way for users to:
1. View or modify the raw local-source consent scope from the UI.
2. Inspect what raw sessions were discovered on disk for the active date before or after summary generation.
3. Preview raw conversations directly from local storage to verify collector accuracy.

## Proposed User Experience

### 1. Header Trigger
Add a dedicated, discreet button in `web/ZenJournal.tsx` header alongside the Settings button:
- Label: `📂 Local Activity` (in English) / `📂 本機紀錄` (in Traditional Chinese).
- Disabled when a summary generation is actively running (`isGenerating`).

### 2. Inspection Modal (`web/LocalActivityModal.tsx`)
Opening the button presents a dedicated Zen-styled modal with three distinct sections:

#### Section A: Local Source Consent
- Discloses that conversation histories stay on this computer, are never sent externally without separate summarization permission, and are read read-only.
- Checkbox controls for each supported local agent:
  - `Claude Code` (`claude-code`)
  - `OpenAI Codex` (`codex`)
  - `Google Antigravity` (`antigravity`)
- "Save Scope" action button:
  - Sends `PUT /api/collector/consent`.
  - Disables while saving (`disabled={isSaving}`).
  - Refreshes coverage and session list immediately upon successful save.

#### Section B: Source Coverage (for Active Date)
Displays the status of each source for `selectedDate`:
- `Available`: e.g., "Google Antigravity · 3 sessions · available"
- `No Activity`: e.g., "OpenAI Codex · no activity"
- `Incomplete`: e.g., "Claude Code · incomplete: malformed record · 1 session · 1 issue"
- `Not Installed`: e.g., "OpenAI Codex · not installed"
- `Not Authorized`: e.g., "Claude Code · not authorized" (if unselected in consent)

#### Section C: Discovered Sessions & On-Demand Preview
- Lists all sessions discovered on that calendar date:
  - Source badge (`claude-code`, `codex`, `antigravity`).
  - Session ID and file path.
  - Message count and timestamp range.
- "Preview locally" button for each session:
  - Fetches `/api/collector/sessions/:id?source=:source&date=:date` only when clicked.
  - Expands inline to show the parsed user and assistant messages.
  - Shows loading state ("Loading session…") and disables repeat clicks.

## Proposed Test Cases (LA-1 to LA-8)

Before implementation, these explicit test cases are derived from the intended behavior:

| Test ID | Scenario | Expected Observable Result |
| --- | --- | --- |
| **LA-1** | Initial Modal Open | Modal opens, fetches `/api/collector/consent`, and initializes checkboxes with currently saved sources (`claude-code`, `codex`, `antigravity`). |
| **LA-2** | Empty Consent State | When no sources are consented (`sources: []`), shows clear guidance: "Collection is off. Choose sources and save to allow local reads." Does not request `/api/collector/today`. |
| **LA-3** | Consent Scope Update | Checking/unchecking sources and clicking "Save" calls `PUT /api/collector/consent`. The button is disabled during save, shows "Saving…", and upon success refreshes metadata for the current date. |
| **LA-4** | Source Coverage Presentation | Coverage cards render exact states (`available`, `no-activity`, `incomplete: reason`, `not-installed`, `not-authorized`) with corresponding badges and issue counts. |
| **LA-5** | Session List for Active Date | Discovered sessions for `selectedDate` are displayed chronologically with message counts and issue warnings. |
| **LA-6** | On-Demand Session Preview | Clicking "Preview locally" fetches `/api/collector/sessions/:id?source=:source&date=:date` on-demand; renders messages in evidence order; toggle collapses on second click. |
| **LA-7** | Error & Conflict Handling | Handles 409 `collection_in_progress` with an informative error message; handles network or server 500 errors gracefully without crashing the UI. |
| **LA-8** | Disabled States & Visual Feedback | All buttons, checkboxes, and preview triggers strictly transition to `:disabled` (opacity `0.42`, `cursor: not-allowed`) while async operations are in-flight. |

## Verification Plan

1. **Automated Unit Tests**:
   - Add unit tests covering pure helpers/view functions and state mapping (in `test/web/local-activity-view.test.ts` or `test/web/report-view.test.ts`).
   - Verify `npm run check` (Prettier, ESLint, `tsc`, Vitest, Vite build) passes cleanly with 0 errors.
2. **Manual Live Verification**:
   - Open the Local Activity modal in the browser.
   - Test toggling consent (e.g., enable/disable Antigravity or Codex) and verify persistence in `data/local-sources.json`.
   - Verify coverage display matches real discovered sessions for `2026-09-18` and `2026-09-19`.
   - Click "Preview locally" on a real Antigravity or Claude Code session and confirm messages render cleanly.
