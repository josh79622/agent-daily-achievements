# First-read local-source consent implementation plan

**Goal:** Require an explicit saved source choice before any local history access.

**Architecture:** Server-owned consent in an ignored JSON file gates both collector routes. The collector receives an explicit source list. Consent changes invalidate in-flight results; the page clears stale results and offers persistent settings controls.

**Tech Stack:** Existing Node 24, npm, TypeScript, built-in HTTP/filesystem APIs, framework-free browser.

## Task 1: Specify the boundary (C1–C7)

- Add `test/server/consent.test.ts` with synthetic collectors, temporary settings, restart checks, malformed/unreadable settings, save failures, invalid requests, and in-flight withdrawal.
- Extend `test/collector/local-collector.test.ts` to prove unselected directory configuration is never accessed.
- Update the existing authorized preview test to explicitly save consent.
- Run `node_modules/.bin/tsx --test test/server/consent.test.ts test/collector/local-collector.test.ts`; confirm expected failures, then commit the failing tests.

## Task 2: Enforce consent (C1–C7)

- Create `src/storage/local-consent.ts`: validated versioned source choice, missing-is-empty, atomic writes, no conversation storage.
- Update `src/server/app.ts`: consent GET/PUT routes, host/origin validation, blocked reads before consent, serialized writes, generation checks after collection.
- Update `src/collector/local-collector.ts`: explicit allowed sources, no unselected directory access.
- Wire the ignored settings path in `src/server/index.ts`.
- Run focused tests; review the diff and commit implementation separately from failing tests.

## Task 3: Consent interface (C1, C3, C5, C8)

- Extend `test/web/build-output.test.ts` with unchecked controls and disclosure assertions; run to observe failure and commit.
- Update `web/index.html`, `web/app.ts`, and `web/styles.css`: disclosure, unchecked source controls, explicit save, error handling, request invalidation, and source authorization labels.
- Use consent checks before metadata and previews; clear stale page data on settings changes and failed requests.
- Run `npm run check` (format, lint, typecheck, tests, build). Inspect the UI against synthetic records, including save, preview, withdrawal, reload, and errors.

## Task 4: Review and handoff

- Obtain a focused code review of the privacy boundary while preparing documentation.
- Correct findings with failing regression tests and separate correction commits.
- Run the full gate after corrections, update README, PROGRESS, and TODO with actual evidence, and commit the final handoff. Preserve the existing branch history; do not merge or squash.

All commands run in `.worktrees/ui-skeleton` with `/opt/homebrew/opt/node@24/bin` first on PATH. No live conversation records are needed.
