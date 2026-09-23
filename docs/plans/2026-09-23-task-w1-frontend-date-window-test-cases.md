# Task W1 — Frontend 07:00 Report Window Alignment: Design and Test Cases

Status: awaiting Josh's approval. No code until then (AGENTS.md).

Addresses the open gap in `PROGRESS.md` (item 4 under Handoff) and `TODO.md` (Phase 6):
"`getYesterdayDate()` in `web/date-utils.ts` still assumes a midnight boundary; align the page's default date with the 07:00 window."

## What cannot be seen now → what will be visible when done

- **Now**:
  - `getYesterdayDate()` uses calendar midnight (`d.setDate(d.getDate() - 1)`).
  - Between 00:00:00 and 06:59:59 local time, `getYesterdayDate()` returns calendar yesterday (`D-1`).
  - However, window `D-1` (`[D-1 07:00, D 07:00)`) is still currently *open* and in progress (it completes at `D 07:00`). The schedule has only generated up to `D-2`.
  - Between midnight and 07:00, the page defaults to `D-1` (an open window with no scheduled report), and `getTodayDate()` allows selecting `D` (a report date whose window has not even begun).
- **Done**:
  - `getYesterdayDate()` returns the date of the **most recently finished report window**:
    - At or after 07:00: returns `D-1`.
    - Before 07:00: returns `D-2`.
  - `getTodayDate()` returns the date of the **current open report window**:
    - At or after 07:00: returns `D`.
    - Before 07:00: returns `D-1`.
  - Date stepping and `DateSelector`'s `max` attribute correctly clamp navigation to the current open window date.
  - The pure 07:00 window calculation is extracted into a browser-safe module (`src/report/date-window.ts`) shared between frontend and backend, with zero Node.js dependencies.

## Design

1. **Extract pure date window functions to `src/report/date-window.ts`**:
   - `reportDateFor(timestamp: string | Date, timeZone: string): string`
   - `previousCalendarDate(date: string): string`
   - `nextCalendarDate(date: string): string`
   - `mostRecentFinishedWindow(now: Date, timeZone: string): string`
   - `currentOpenWindow(now: Date, timeZone: string): string`
   - Zero imports from `node:fs`, `node:path`, or `node:os`. Uses standard `Intl.DateTimeFormat` and `Date.UTC`.
2. **Backward-compatible re-exports**:
   - `src/collector/local-collector.ts` re-exports `reportDateFor` from `../report/date-window.js`.
   - `src/schedule/report-window.ts` re-exports or delegates to `../report/date-window.js`.
3. **Frontend integration in `web/date-utils.ts`**:
   - `getDefaultTimeZone()`: returns `Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"`.
   - `getYesterdayDate(now?: Date, timeZone?: string)`: returns `mostRecentFinishedWindow(now, timeZone)`.
   - `getTodayDate(now?: Date, timeZone?: string)`: returns `currentOpenWindow(now, timeZone)`.
   - `shiftDateString(dateStr: string, offsetDays: number, maxDate?: string)`: clamps to `maxDate ?? getTodayDate()`.

## Test cases

Given/When/Then. "Open window" means the window currently in progress. "Finished window" means the completed window preceding the open window.

### Date Window Boundaries (`test/report/date-window.test.ts`)

- **W1-1**: Given local time is 09:00 on 18 Sep, when open window is computed, then it is 18 Sep.
- **W1-2**: Given local time is 01:30 on 19 Sep, when open window is computed, then it is 18 Sep.
- **W1-3**: Given local time is exactly 07:00:00 on 19 Sep, when open window is computed, then it is 19 Sep (start-inclusive).
- **W1-4**: Given local time is 06:59:59 on 19 Sep, when open window is computed, then it is 18 Sep (end-exclusive).
- **W1-5**: Given local time is 01:30 on 19 Sep, when most recently finished window is computed, then it is 17 Sep.
- **W1-6**: Given local time is 07:00:00 on 19 Sep, when most recently finished window is computed, then it is 18 Sep.
- **W1-7**: Given a daylight-saving transition day, when windows are evaluated across 07:00, then no date is skipped or duplicated.
- **W1-8**: Given an explicit timezone, when window date is computed, then it strictly evaluates according to that timezone's wall clock.

### Frontend Date Utilities (`test/web/date-utils.test.ts`)

- **W1-9**: Given a clock time between midnight and 06:59:59, when `getYesterdayDate()` is called, then it returns two calendar days prior (`D-2`).
- **W1-10**: Given a clock time at or after 07:00:00, when `getYesterdayDate()` is called, then it returns one calendar day prior (`D-1`).
- **W1-11**: Given a clock time between midnight and 06:59:59, when `getTodayDate()` is called, then it returns one calendar day prior (`D-1`, the open window).
- **W1-12**: Given a clock time at or after 07:00:00, when `getTodayDate()` is called, then it returns current calendar day (`D`, the open window).
- **W1-13**: Given current open window date, when `shiftDateString(today, +1)` is called, then it does not exceed the open window date.

### Component Integration (`test/web/DateSelector.test.tsx`)

- **W1-14**: Given the selected date is the open window date (whether before 07:00 or after 07:00), when rendered, then the "Next day" button is disabled.
- **W1-15**: Given the selected date is earlier than the open window date, when rendered, then the "Next day" button is enabled.

## Verification beyond unit tests

1. Run full `npm run check` (format, lint, typecheck for both server and web, vitest suite, vite build).
2. Verify in browser on `http://127.0.0.1:4317/`:
   - Inspect the date stepper and default date.
   - Confirm that the latest selectable date matches the open report window.
