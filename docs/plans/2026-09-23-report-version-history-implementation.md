# Report Version History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve every regenerated daily report, render all versions for a selected date, and localize the settings model controls.

**Architecture:** `ReportStore` becomes append-only per report date through version envelopes, while retaining its existing latest-report read as a compatibility view. The server exposes version reads and version-scoped achievement mutation; the browser loads a date's version list and renders all reports newest first. UI chrome is translated through the existing translation packs, but each saved report's generated prose is displayed unchanged.

**Tech Stack:** TypeScript, Node built-in HTTP server and filesystem APIs, React, Vitest, Testing Library.

---

### Task 1: Make report storage append-only per date

**Files:**
- Modify: `src/storage/report-store.ts`
- Modify: `test/storage/report-store.test.ts`

1. Add failing tests: two saves for one date return two immutable `ReportVersion` envelopes newest-first; a flat legacy `<date>.json` remains readable after a new save; replacing one version does not change its sibling.
2. Run `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx vitest run test/storage/report-store.test.ts`; expect RED because the version API does not exist.
3. Add a `ReportVersion` envelope (`id`, `generatedAt`, `report`). Save new reports atomically to `data/reports/<date>/<id>.json`. Read an existing flat `<date>.json` as a synthetic legacy version based on filesystem modification time; do not move or delete it. Add `listVersions`, `readVersion`, and `replaceVersion`; preserve `read(date)` as newest-report compatibility view.
4. Re-run the focused storage test for GREEN.
5. Commit: `git add src/storage/report-store.ts test/storage/report-store.test.ts && git commit -m "feat(storage): retain report versions"`.

### Task 2: Serve and mutate a named report version

**Files:**
- Modify: `src/server/app.ts`
- Modify: `test/server/app.test.ts`
- Modify: `test/server/report-achievements.test.ts`

1. Add failing tests for `GET /api/reports/<date>/versions`, asserting newest-first envelopes and no raw conversation records. Extend achievement tests to mutate `/api/reports/<date>/versions/<versionId>/achievements/<achievementId>` and prove a sibling version remains unchanged. Include missing-version and cross-site refusal cases.
2. Run `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx vitest run test/server/app.test.ts test/server/report-achievements.test.ts`; expect RED because the routes do not exist and edits are date-wide.
3. Route the version-list GET to `reportStore.listVersions`. Route version-scoped PATCH and DELETE through `readVersion` plus `replaceVersion`, retaining origin and achievement validation. Keep date-only and latest GET routes as newest-report compatibility views.
4. Re-run the focused server tests for GREEN.
5. Commit: `git add src/server/app.ts test/server/app.test.ts test/server/report-achievements.test.ts && git commit -m "feat(server): expose versioned reports"`.

### Task 3: Move settings model labels into translation packs

**Files:**
- Modify: `web/SettingsModal.tsx`
- Modify: `web/locales/en.ts`
- Modify: `web/locales/zh-TW.ts`
- Modify: `web/locales/es.ts`
- Modify: `test/web/SettingsModal.status.test.tsx`

1. Add failing UI assertions that the preferred-provider badge and default-model option render English and Traditional Chinese strings from `t.settings`, not literal bilingual text.
2. Run `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx vitest run test/web/SettingsModal.status.test.tsx`; expect RED because both strings are hard-coded.
3. Add `preferredBadge` and `defaultModel` to the English reference pack and matching built-in packs. Render both from `t.settings`; existing English fallback serves older runtime language packs.
4. Re-run the focused settings test for GREEN and type-check the packs.
5. Commit: `git add web/SettingsModal.tsx web/locales test/web/SettingsModal.status.test.tsx && git commit -m "fix(web): localize model control labels"`.

### Task 4: Render every version for a selected date

**Files:**
- Modify: `web/ZenJournal.tsx`
- Modify: `web/Constellation.tsx`
- Modify: `web/locales/en.ts`
- Modify: `web/locales/zh-TW.ts`
- Modify: `web/locales/es.ts`
- Modify: `web/styles.css`
- Add: `test/web/ZenJournal.report-versions.test.tsx`

1. Mock `GET /api/reports/<date>/versions` with two envelopes. Write failing tests that both reports render newest-first, each has a localized generated-time heading, report text stays exactly as returned, and an edit request includes the rendered version id.
2. Run `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx vitest run test/web/ZenJournal.report-versions.test.tsx`; expect RED because the page holds only one report.
3. Load the version-list endpoint into `ReportVersion[]` state and render one labelled section per envelope newest-first. Format only creation-time UI through the active UI language. Thread `versionId` through edit/delete calls. Preserve empty states and post-generation refresh.
4. Re-run the new test plus existing report-view and permission-error tests for GREEN.
5. Commit: `git add web/ZenJournal.tsx web/Constellation.tsx web/styles.css web/locales test/web && git commit -m "feat(web): show report version history"`.

### Task 5: Verify integration

1. Run `PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run check`; expect format, lint, both TypeScript checks, all tests, and production build to pass.
2. Run `git diff --check origin/master...HEAD && git status --short --branch`; expect no whitespace errors and only intended version-history/localization changes.
3. If `PROGRESS.md` or `TODO.md` needs a session-boundary update, commit it separately as `docs: record report version history verification`.
