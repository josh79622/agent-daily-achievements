# Header Icon Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the five header utility actions compact and layout-stable in every language by presenting them as equal-size icon controls with localized, keyboard-accessible tooltips.

**Architecture:** Introduce one small reusable header icon-control component that owns the accessible name and hover/focus tooltip markup. Refactor the existing Today, Local Activity, Settings, Language, and Theme controls to use that presentation while leaving date navigation and each action's state/callback intact. Give the header deliberate desktop and narrow layouts with logical CSS properties, rather than relying on translated labels to wrap harmlessly.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, existing i18n language packs.

---

## Scope and acceptance boundary

This implements the approved design in
`docs/plans/2026-09-22-header-icon-controls-design.md` only. It does not change
report selection behaviour, language-menu options, settings/activity modal content,
theme persistence, or any installer behaviour.

The five utilities are Today, Local Activity, Settings, Language, and Theme. The
previous/next arrows and native date input remain date-navigation controls. A native
`title` is insufficient because it is not a reliable focus-visible tooltip, so the
implementation must render an explicit tooltip that CSS displays for both `:hover`
and `:focus-within`. The button's localized `aria-label` remains its primary
accessible name.

### Task 1: Add the reusable accessible icon-control primitive

**Files:**
- Create: `web/HeaderIconButton.tsx`
- Create: `test/web/HeaderIconButton.test.tsx`

**Step 1: Write failing component tests for HIC-4, HIC-5, and HIC-6.**

Render a test icon control with a localized label and assert all of the following:

- the button has that exact accessible name and contains only the supplied icon;
- a tooltip element with `role="tooltip"` contains the same localized text and is
  associated with the trigger using `aria-describedby`;
- pointer enter/leave and keyboard focus/blur expose the tooltip state/class used by
  the component, so neither interaction relies on a browser-only `title`;
- disabled and caller-supplied `aria-pressed` / `aria-expanded` values are forwarded
  unchanged and a disabled trigger does not invoke its click handler.

**Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run test/web/HeaderIconButton.test.tsx`

Expected: FAIL because `web/HeaderIconButton.tsx` does not exist.

**Step 3: Implement the minimal primitive.**

Create `HeaderIconButton` around a semantic `button` and an adjacent tooltip. Accept
the localized `label`, `children` icon, normal button props needed by the existing
controls, and an optional `className`. Use `useId` for a stable trigger/tooltip link;
keep transient hover/focus visibility in component state so the test and CSS have an
explicit contract. Give the root and trigger stable classes (`header-icon-control`,
`header-icon-button`, and `header-icon-tooltip`) but do not set dimensions here.

**Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run test/web/HeaderIconButton.test.tsx`

Expected: PASS.

**Step 5: Commit the independently reviewable accessibility primitive.**

```bash
git add web/HeaderIconButton.tsx test/web/HeaderIconButton.test.tsx
git commit -m "feat: add accessible header icon control"
```

### Task 2: Refactor the five approved utilities without changing their actions

**Files:**
- Modify: `web/DateSelector.tsx`
- Modify: `web/LanguageSelector.tsx`
- Modify: `web/ZenJournal.tsx`
- Modify: `web/locales/en.ts`
- Modify: `web/locales/es.ts`
- Modify: `web/locales/zh-TW.ts`
- Modify: `test/web/DateSelector.test.tsx`
- Modify: `test/web/LanguageSelector.test.tsx`
- Create: `test/web/ZenJournal.header-controls.test.tsx`

**Step 1: Write failing DateSelector tests for HIC-1 and HIC-3.**

Extend `test/web/DateSelector.test.tsx` to assert that Today is an icon-only
`HeaderIconButton`, retains the localized accessible name and tooltip text, and calls
`onDateChange(getTodayDate())`. Keep the existing previous/next glyph, stepping, and
disabled tests; update the existing disabled Today lookup from `getByTitle` to the
accessible button role. Assert the native date input remains labelled and present.

**Step 2: Run the focused DateSelector test to verify it fails.**

Run: `npx vitest run test/web/DateSelector.test.tsx`

Expected: FAIL because Today still renders localized visible text.

**Step 3: Write failing LanguageSelector tests for HIC-1, HIC-4, HIC-5, and HIC-6.**

Extend `test/web/LanguageSelector.test.tsx` to assert the trigger is icon-only,
retains `aria-haspopup="listbox"` and live `aria-expanded`, and has a localized
tooltip that includes the selected language's native name. Change the selected
language in the render helper (for example, `en` and `zh-TW`) and assert the trigger
has the same icon-control class in both cases rather than a text-dependent width.
Keep opening, search, Escape, and option-selection coverage intact.

**Step 4: Run the focused LanguageSelector test to verify it fails.**

Run: `npx vitest run test/web/LanguageSelector.test.tsx`

Expected: FAIL because the current language name is rendered in the trigger and no
formatted current-language tooltip exists.

**Step 5: Write the failing header integration test.**

Create `test/web/ZenJournal.header-controls.test.tsx`. Mock only network/report
responses required for the shell to render, then assert Local Activity, Settings, and
Theme are icon-only controls with localized names and tooltips. Verify clicking each
still opens its existing modal or toggles `data-theme`; verify disabled utility
controls retain their disabled semantics while report generation is busy. Do not
replace the existing modal implementations with new behaviour.

**Step 6: Run the integration test to verify it fails.**

Run: `npx vitest run test/web/ZenJournal.header-controls.test.tsx`

Expected: FAIL because the three ZenJournal controls still include text spans and do
not use the shared primitive.

**Step 7: Make the smallest refactor that passes all three test files.**

- In `DateSelector.tsx`, replace the visible Today label with a calendar/today icon
  through `HeaderIconButton`; do not alter the previous/next arrow direction or date
  input.
- In `LanguageSelector.tsx`, use a globe-only trigger. Add a header translation
  template such as `languageCurrentTooltip: "Language: {language}"` to all shipped
  packs, and format it with `findLanguage(language)?.native ?? language`. Preserve
  listbox ownership, Escape/outside-click closing, and `aria-expanded`.
- In `ZenJournal.tsx`, replace only Local Activity, Settings, and Theme trigger
  presentation with folder, gear, and sun/moon icons through the primitive. Preserve
  callbacks, modal state, disabled values, and theme localStorage behaviour.

**Step 8: Run focused component and integration tests to verify they pass.**

Run: `npx vitest run test/web/HeaderIconButton.test.tsx test/web/DateSelector.test.tsx test/web/LanguageSelector.test.tsx test/web/ZenJournal.header-controls.test.tsx`

Expected: PASS.

**Step 9: Commit the behaviour-preserving component refactor.**

```bash
git add web/DateSelector.tsx web/LanguageSelector.tsx web/ZenJournal.tsx \
  web/locales/en.ts web/locales/es.ts web/locales/zh-TW.ts \
  test/web/DateSelector.test.tsx test/web/LanguageSelector.test.tsx \
  test/web/ZenJournal.header-controls.test.tsx
git commit -m "feat: compact header utility controls"
```

### Task 3: Define fixed utility hit areas and intentional responsive header layout

**Files:**
- Modify: `web/styles.css`
- Modify: `test/web/styles-rtl.test.ts`
- Create: `test/web/header-icon-layout.test.ts`

**Step 1: Write failing stylesheet contract tests for HIC-1, HIC-2, HIC-7, and HIC-8.**

In `test/web/header-icon-layout.test.ts`, read `web/styles.css` and assert:

- `.header-icon-button` has equal fixed inline/block dimensions, zero text-driven
  layout dependence, and centers the icon;
- the desktop `.zen-header` / navigation group use a deliberate non-wrapping flex
  arrangement;
- a single explicit narrow-width media query changes the header into two intentional
  rows, keeps the date group and utility group intact, and prevents page-level
  horizontal overflow;
- tooltip positioning uses `inset-inline-*`, never `left` or `right`.

Extend `test/web/styles-rtl.test.ts` with the tooltip selector so the existing logical
property guard covers it. These are CSS-contract tests, not a claim that jsdom
performs visual layout.

**Step 2: Run the focused stylesheet tests to verify they fail.**

Run: `npx vitest run test/web/header-icon-layout.test.ts test/web/styles-rtl.test.ts`

Expected: FAIL because the icon-control and responsive header rules do not exist.

**Step 3: Add the minimal CSS.**

Add a dedicated header utility group in `web/styles.css` and style all five controls
to the same square hit area. Reuse existing dark/light borders, disabled treatment,
focus-visible outline, and pressed/open appearance; remove the current
`.language-selector-btn` minimum width and all visible header utility text layout.
Style the tooltip below/above its trigger with logical insets and show it for both the
component's hover and focus-visible state. At a documented narrow breakpoint, switch
the header to a two-row compact layout: date navigation in one non-wrapping group and
the five utilities in a separate non-wrapping group. Use `min-width: 0`, appropriate
gaps, and logical alignment so no control clips, overlaps, or causes horizontal page
overflow. Preserve RTL arrow output from `DateSelector` rather than reversing it in
CSS.

**Step 4: Run the stylesheet tests to verify they pass.**

Run: `npx vitest run test/web/header-icon-layout.test.ts test/web/styles-rtl.test.ts`

Expected: PASS.

**Step 5: Build and manually inspect the approved visual matrix.**

Run: `npm run build`

Then run the local app and manually inspect English, Traditional Chinese, Japanese,
and an RTL runtime language in dark and light themes at one ordinary desktop width and
just below/above the new breakpoint. Use both pointer hover and keyboard Tab focus to
check tooltip visibility, tab order, clipping, overlap, scrollbars, disabled state,
open language-menu state, and date navigation.

Expected: production build succeeds; each desktop header is one row, each narrow
header uses the intended compact layout, and every action remains reachable.

**Step 6: Commit the layout and its static contracts.**

```bash
git add web/styles.css test/web/header-icon-layout.test.ts test/web/styles-rtl.test.ts
git commit -m "style: stabilize header icon control layout"
```

### Task 4: Run the project gate and review the focused diff

**Files:**
- Modify only if required by a verified failure from the commands below.

**Step 1: Run the complete ordered verification gate.**

Run: `npm run check`

Expected: Prettier, ESLint, both TypeScript projects, all Vitest tests, and the
production build PASS.

**Step 2: Review the completed change.**

Run: `git diff HEAD~3..HEAD -- web test/web`

Confirm the diff contains no changes outside the approved header controls, no
translation-dependent header utility text, no use of `title` as the only tooltip, and
no physical tooltip positioning properties.

**Step 3: Record the actual verification result.**

Update `PROGRESS.md` or `TODO.md` only if one already exists and needs the completed
header task recorded. Do not create a status file solely for this work. Commit any
verification-driven correction separately with an accurate message.
