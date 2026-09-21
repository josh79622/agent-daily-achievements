# Task L3 — right-to-left layout: design and test cases (for approval)

Status: awaiting Josh's approval. No code until then (AGENTS.md).

Josh chose option 2 on 2026-09-21: flip the layout properly, rather than leaving
Arabic, Hebrew, Persian and Urdu locked or offering them unflipped.

## What cannot be seen now → what will be visible when done

Now: `ar`, `he`, `fa`, `ur` are listed as `尚未提供` with no Add button, because the
interface only reads left-to-right.
Done: they carry an Add button like any other language, and choosing one mirrors the
whole interface — text starts at the right, the header controls run right-to-left, the
day arrows point the correct way, and the coloured accent bars sit on the reading-start
edge of each card.

## Design

- The page sets `dir="rtl"` on `<html>` for those four codes, `ltr` otherwise, next to
  the existing `document.documentElement.lang` effect in `web/ZenJournal.tsx`.
- CSS moves from physical to logical properties, so one rule serves both directions:
  `margin-left` → `margin-inline-start`, `border-left` → `border-inline-start`,
  `padding-right` → `padding-inline-end`, `text-align: left` → `text-align: start`,
  and `left`/`right` on positioned elements → `inset-inline-start`/`inset-inline-end`.
  A survey found **22** such declarations in `web/styles.css`.
- Genuinely physical positions stay physical: the decorative `left: var(--x)` /
  `left: 50%` used for canvas-style placement in the Constellation view is a coordinate,
  not a reading edge, and must not be converted.
- The `←` / `→` day arrows keep their meaning, not their glyph: in a right-to-left
  interface "previous day" points right. The arrows are chosen from the direction, so
  the button labelled "previous day" always points toward the start of the reading order.
- `web/language-options.ts` drops the `unavailable` status: those four codes become
  `addable` like the rest, and `src/summarizer/language-pack-run.ts` and the build route
  stop refusing them. **Test L2-16 changes meaning and will be rewritten.**
- `isRtlLanguage` (already in `src/report/languages.ts`) becomes the single source of
  truth for direction, used by both the web app and the tests.

## Test cases

### Direction (pure)

- **L3-1** `directionFor` returns `"rtl"` for `ar`, `he`, `fa`, `ur`.
- **L3-2** It returns `"ltr"` for every other catalog code, including `zh-TW` and `en`.
- **L3-3** It returns `"ltr"` for an unknown code, so a bad saved value cannot flip the page.

### Page wiring

- **L3-4** Choosing `ar` sets `<html dir="rtl">` and keeps `lang="ar"`.
- **L3-5** Switching from `ar` back to `zh-TW` restores `dir="ltr"`.
- **L3-6** A page load with `ar` saved and its pack cached opens with `dir="rtl"` already set.
- **L3-7** A page load with `ar` saved but its cached pack gone falls back to English **and**
  to `dir="ltr"` — the direction never outlives the language.

### Day arrows

- **L3-8** In a left-to-right language the "previous day" control shows `←` and the
  "next day" control shows `→`.
- **L3-9** In a right-to-left language they swap: "previous day" shows `→`, "next day"
  shows `←`. Their actions are unchanged — previous is still the earlier date.
- **L3-10** The date arrows' accessible labels stay the same words in both directions.

### Stylesheet

- **L3-11** `web/styles.css` contains no `margin-left`, `margin-right`, `padding-left`,
  `padding-right`, `border-left`, `border-right` or `text-align: left|right` declaration.
- **L3-12** The positioned header, menu and badge rules use `inset-inline-*` rather than
  `left`/`right`.
- **L3-13** The Constellation view's coordinate positioning (`left: var(--x)`, `left: 50%`)
  is deliberately still physical, and a test records that exemption so a later sweep does
  not "fix" it.
- **L3-14** Every achievement card accent bar (the five state colours) uses
  `border-inline-start`, so it sits on the reading-start edge in both directions.

### The four languages become addable

- **L3-15** `searchLanguageOptions` reports `ar`, `he`, `fa`, `ur` as `addable`, and the
  `unavailable` status no longer occurs for any catalog code.
- **L3-16** (replaces L2-16) A build request for `ar` is no longer refused; it reaches the
  provider like any other addable language.
- **L3-17** The `languageNotAvailable` string is removed from the three built-in packs if
  nothing renders it any more.

## Verification beyond unit tests

Checked by me in the browser against the real server, in both themes: the header, the
three views (`方案 A/B/C`), the language dropdown and a report card, in `ar` and back in
`zh-TW`. This needs one real Add for Arabic through the chosen provider — **one CLI call,
which I will ask you to approve before running**, as with Japanese.
