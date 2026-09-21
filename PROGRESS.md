# Progress

## Current phase

**Phase 5 — Report control** (scoped work complete as of 2026-09-18)

Phase 4 closed as scoped on 2026-09-18 after its
[exit review](docs/reviews/2026-09-18-phase-4-exit-review.md). The tool can
collect consented local Claude Code and Codex records, gate external
summarization behind a separate permission, validate and score model-shaped
reports, and manage provider sign-in, readiness, model, and effort settings.
As of later that day, it can also run the real summarizer end to end and show
the result: one real day (2026-09-09) has been summarized by Claude Code
`haiku` and rendered in the browser, source trace-back works against real
local history, reports are kept with history rather than overwritten, and
Josh can edit or remove an incorrect achievement. Every `TODO.md` checkbox
under Phase 5 is now checked. Not done, and not in scope as originally
written: the cross-day "knowledge map" idea (decision 1 below) is a new,
undesigned feature Josh raised mid-phase, not a Phase 5 deliverable.

**Framework decision made, 2026-09-18: React + Vite, migrating in 5 tasks.**
Chosen over Next.js: `src/server/app.ts` already does this app's genuinely
complex, privacy-sensitive work (local file reads, consent, CLI invocation)
as a plain Node server, and this is a single local page with no
SSR/multi-page/SEO need — Next.js would mean rewriting that server as Route
Handlers or running two servers side by side, for no benefit here. React
only replaces the front end; the server keeps its own `tsc` build,
untouched. For the constellation itself, Josh suggested finding an existing
library rather than hand-rolling layout again; **React Flow (`@xyflow/react`)
is the pick** — its nodes are real React components (so the existing
Expand/Show source/Edit/Remove controls and forms can move in directly) and
it has built-in edges, which the still-undesigned cross-day "knowledge map"
(decision 1 below) will need anyway.

Migration order (approved by Josh): (1) scaffold Vite + React + a proof-of-
build shell, server untouched; (2) constellation on React Flow, fetching the
real report; (3) port Expand/Show source/Edit/Remove into node components;
(4) port the Local activity and Report sign-in panels; (5) replace the
bundle-string assertions in `test/web/*.test.ts` with component-level tests.
Each task is expected to temporarily leave the page less capable than the
version it replaces, restored feature by feature — that is the plan, not a
regression to fix mid-task.

- **Task 1 done (`f1b5718`)**: `vite.config.ts` (builds `web/` into
  `dist/web`), `tsconfig.web.json` (JSX/DOM/bundler settings for
  `web/**/*.{ts,tsx}` only, `typecheck` now runs both configs),
  `scripts/build.mjs` now runs `tsc` then `vite build`. `web/app.ts` (742
  lines of hand-written DOM) is removed, not kept as dead code; `web/report-view.ts`
  (pure, already-tested) and `web/styles.css` are kept for reuse. Server's
  static file serving generalized from a fixed 3-path map to resolving any
  file under `staticDirectory`, path-traversal guarded (Vite's output has
  its own hashed names). Manually verified: real server boots, serves the
  real built page and its hashed JS/CSS, and correctly 404s a literal and a
  percent-encoded `../` traversal attempt. `npm run check` passed with 268
  tests; the six old bundle-string assertions in `build-output.test.ts` were
  retired (not left failing) and replaced with one shell smoke test.
- **Task 2 done (`a7f7144`)**: `web/Constellation.tsx` fetches
  `/api/reports/latest` and renders each achievement as a React Flow
  (`@xyflow/react`) node, reusing `report-view.ts`'s
  `mapAchievementsToNodes`/`layoutPosition`/`describeIncomplete` unchanged;
  handles the same no-report/zero-achievements/incomplete states as before.
  Two real layout bugs found only by checking the browser, not from reading
  the code: reusing `.constellation-node`'s absolute-positioning CSS
  collapsed the node to zero measured size, leaving React Flow's own
  `visibility: hidden` permanent (fixed with a dedicated
  `.achievement-card` class); and `.constellation`'s `min-height: 100vh`
  doesn't give React Flow's `height: 100%` container anything to resolve
  against (changed to `height: 100vh`). Manually verified against the real
  2026-09-09 report (three achievements, scroll-to-zoom, no console errors)
  and against a temporarily removed report (same empty state as before,
  restored afterward). `npm run check` passed with 268 tests.
- **Task 3 done (`e342648`)**: `web/Constellation.tsx`'s `AchievementNode`
  ports the 4 interactive controls from vanilla DOM: Expand (toggles
  `.is-expanded` and reveals `.node-detail`), Show source (on-demand fetches
  `/api/collector/sessions/:recordId?source=:source&date=:reportDate` and
  renders cited messages or non-traceable notice via `report-view.ts`), Edit
  (inline `<form>` with title/detail textareas, sending `PATCH
  /api/reports/:date/achievements/:id`, inline error handling, and
  Save/Cancel), and Remove (two-step confirmation with `DELETE
  /api/reports/:date/achievements/:id`). `web/styles.css` rules adapted to
  `.achievement-card` for hover/focus controls, expanded width/detail,
  source list, and edit form, excluding `.text-button` from the `+` prefix.
  `format:check`, `lint`, `typecheck` (both configs), and `build` passed.
- **UI Overhaul to Style A: Cosmic Constellation (`45eb363`)**:
  Josh reviewed the UI, found the previous plain wireframe unattractive,
  and asked why the radiating node connection feature was missing. He compared
  two design prototypes and selected Style A: Cosmic Constellation.
- **Core Value Refocus & Prompt Overhaul (`95419c1`)**:
  Josh observed that 3D stars and cosmic visuals drifted from the tool's core
  value: providing cognitive relief, emotional closure, and confidence that
  the day was not wasted. Summaries must remain human-centered:
  - 3-5 punchy conclusions (<40 chars) per day.
  - 1-2 clean outcome sentences focusing on tangible decisions and deliverables.
  - Zero conversational audit jargon ("the user pointed out...", "checked git log...").
  - First-class credit for negative/rejection decisions (`decision` category).
  - Strict alignment with developer's primary language.
- **Google Antigravity / Gemini CLI (`agy`) Integration (`1d40a7a`)**:
  Integrated Google Antigravity / Gemini CLI (`agy`) as a first-class Summarizer
  provider alongside Claude Code and Codex:
  - Extended `SummaryProvider` to include `"agy"` across permissions, model catalog,
    readiness probe, and summary runner.
  - Implemented dynamic local model catalog detection via `agy models` (14 local models
    detected, including `gemini-3.8-flash`, `gemini-3.8-pro`, `gemini-2.5-pro`).
  - Readiness probe using `gemini-3.8-flash-low` and JSON envelope output parsing.
  - 7 unit test suites updated; all 279 tests passing.
  - Real 2026-09-09 summary generated with Gemini 3.8 Flash and saved to `data/reports/`.
- **UI Pivot to Zen Daily Journal & Multi-Direction Layout (`04662b0`, `11f01cd`, `b26dcc3`)**:
  Per Josh's instruction to replace the complex star graph with a cleaner, more minimalist design,
  retired the heavy 3D React Flow constellation canvas (bundle size dropped from 414 kB
  to 229 kB, 173 modules down to 18).
  Created `web/ZenJournal.tsx`:
  - 3-way layout switcher in header (persisted in `localStorage` as `daily_proof_view_mode`):
    1. 📖 **Concept A: Minimal Journal (Linear / Raycast)**: Clean vertical cards with status badges and glowing dots.
    2. 🍱 **Concept B: Focus Bento (Apple / Things 3)**: Hero card for the primary milestone + responsive 2-column grid.
    3. 📝 **Concept C: Executive Briefing (Notion / Axios)**: Editorial overview grouped by Deliverables & Key Decisions.
  - Inline expandable evidence drawer fetching traceable session messages on-demand.
  - Inline editing (`PATCH`) and safe two-step deletion (`DELETE`).
  - Date navigation (previous/next day, latest).
- **Model Settings Modal, Unified Language, and Key Milestone (`isPrimary`)**:
  Per Josh's requirements:
  1. **UI Model & Provider Settings**: Restored summarizer settings in a Zen modal (`web/SettingsModal.tsx`) with full support for Google Antigravity / Gemini CLI (`agy`), Anthropic Claude Code, and OpenAI Codex. Supports dynamic model selection (including 14 local Gemini models), reasoning effort configuration, readiness testing, and manual summary generation (`POST /api/reports/generate`).
  2. **Unified Language (UI & Summary)**: Merged UI and summary generation language into a single setting (`zh-TW` Traditional Chinese and `en` English). Seamlessly updates all UI text via `web/i18n.ts`, persists in `localStorage` and `summary-permission.json`, and injects strict language instructions into the AI summary prompt.
  3. **Key Milestone Designation (`isPrimary`)**: Added optional `isPrimary?: boolean` to the `Achievement` contract with fail-closed single-milestone validation in `checkCandidate`. The summary prompt instructs AI to designate the single most impactful milestone of the day. Highlighted with amber glow and `🌟 Key Milestone` badges across Minimal Journal, Bento Grid (hero card anchor), and Executive Briefing views. Supports user toggling in inline edit (`PATCH`).
  - Unit tests updated (282 tests passing); `npm run check` passed cleanly.
- **Google Antigravity Agent History Collection & Date Navigation**:
  - Integrated `antigravity` into `LocalSource` and `ReportSource`, reading `~/.gemini/antigravity/brain/**/transcript.jsonl`.
  - Parsed `USER_INPUT`, `PLANNER_RESPONSE` (tool calls), `GENERIC` (tool results), while excluding thinking steps and checkpoints. 6 synthetic unit tests added.
  - ZenJournal `selectedDate` defaults to yesterday (`getYesterdayDate()`), with quick navigation (`←`, `Yesterday`, `Today`, `→`, and date input).
  - Added empty date state with one-click on-demand summary generation.
  - Supported Stdin streaming for CLI summarizers (`agy`), eliminating `ARG_MAX` limit for large day payloads. Generated real complete report for 2026-09-18 with `agy` (Gemini 3.8 Flash).
- **Button Disabled States & Visual Feedback Fix**:
  - Added universal `:disabled` and `:disabled:hover` rules in `web/styles.css` (lowered opacity, `cursor: not-allowed !important`, no shadows/transitions).
  - Replaced interactive hover selectors with `:hover:not(:disabled)` across dark and light themes.
  - Unified `isBusy` lock in `SettingsModal.tsx` covering all async operations (generating, testing, saving provider/language/model/effort).
  - Added `isDeleting` state in `AchievementCard` and disabled header controls during active generation.
- **Task 4 done: Local Activity & Raw Collector Inspection Panel**:
  - Built `web/LocalActivityModal.tsx` and `web/local-activity-view.ts` implementing approved test cases LA-1 through LA-8.
  - Added `📂 Local Activity` button in `ZenJournal.tsx` header with unified `isBusy` disabling.
  - Consent scope management for Claude Code, Codex, and Antigravity via `PUT /api/collector/consent`.
  - Source coverage status cards (`available`, `incomplete`, `no-activity`, `not-installed`, `not-authorized`) with localized labels, session counts, and issue warnings.
  - Discovered sessions list for the selected date with expandable on-demand local message preview drawer.
  - Refined with unified `DateSelector` (`[←] [Date] [Today] [→]`), lazy session search upon user clicking `[ 🔍 Search ]`, and removal of the header "Verified" badge.
  - Full support for dark and light themes, verified with Vitest (295 tests passing) and `npm run check`.
- **Language Switcher Extracted to Header Navigation**:
  - Extracted language selection out of `web/SettingsModal.tsx` so settings solely handles AI model/provider configuration.
  - Added dedicated language toggle button (`🌐 English` / `🌐 繁體中文`) in `web/ZenJournal.tsx` header.
  - Persisted in `localStorage` and synchronized with `PUT /api/summarizer/permission` for AI summary output language.
  - *Known UI Polish*: Switching language currently causes slight header layout shifting due to variable string lengths in flex buttons without fixed min-widths. To be polished in upcoming styling pass.
- **Task L1 done (`be95d91`, also carries all earlier uncommitted work — Task 4, Settings modal, Antigravity collector, date navigation — which shared its files): language packs as plain strings, built-in zh-TW / en / es, searchable language dropdown**
  (design agreed with Josh 2026-09-21; test cases LC-1 to LC-9 approved by him):
  - `web/locales/{en,zh-TW,es}.ts` hold string-only packs (`{n}`/`{date}` placeholders instead of functions);
    `web/i18n.ts` adds `format`, `withEnglishFallback` (a missing key shows English) and
    `resolveSavedLanguage` (unknown saved code → English; nothing saved → zh-TW, as before).
    `Language` is now any string, no longer a two-value union.
  - `src/report/languages.ts` is one fixed catalog of 41 languages (code, English name, native name)
    shared by the web app and the server. The header button became `web/LanguageSelector.tsx`, a
    searchable dropdown ("Spanish (Español)"); built-ins are listed first and the rest are greyed out
    as "Not available yet" until Task L2.
  - The summary prompt now names the language from the catalog and throws on an unlisted code;
    `summary-permission.ts` and the generate route accept only `auto` or a catalog code (before: any
    string up to 20 characters, placed in the prompt as written).
  - Behavior change: choosing a language no longer creates a summary permission when none is saved
    (the old header toggle did, with all three sources); it only updates an existing one.
  - Removed four unused settings keys; theme, layout-switcher and language labels are now translated.
  - 319 tests pass (24 new, LC-1 to LC-9); `npm run check` passes. Eight deliberate mutations were each
    caught (one first survived because it was equivalent; the real "default a permission" mutation is caught).
    Checked in the browser against the real server: dropdown, search ("espanol" finds Spanish, no match
    shows the empty line), the whole page switches to Spanish, and the saved permission followed
    (`es`, then restored to `zh-TW` byte-for-byte).
  - Known gaps: the "No report has been generated yet." status line comes from the server and is
    not translated; right-to-left languages (Arabic, Hebrew, Persian, Urdu) are listed but need layout
    work before they can be offered in Task L2.
- **Next**: Task L2 — generate a pack for a non-built-in language on demand. Design decisions Josh
  already made (do not re-ask): the user never types a language; they pick from the dropdown (built-in
  plus the addable catalog languages, searchable, labelled "English name (native name)"); built-in
  languages are only zh-TW, en, es; the agent translates the English pack and the result is served to
  the frontend at runtime, with no rebuild and no server restart. Design points I proposed that Josh has
  not yet confirmed: use the provider he already chose; validate that keys match English and that every
  `{placeholder}` survives, and reject the pack otherwise; cache once in `data/locales/<code>.json`
  (do not re-translate on every load); show English, with a status line, while generating or if it
  fails; right-to-left languages (ar, he, fa, ur) need their own layout decision before being offered.
  L2's test cases are not written yet and need Josh's approval before code (AGENTS.md). Then frontend
  Task 5.
- **Task L2 done (uncommitted work committed this session): on-demand language packs.**
  Design and the 25 approved test cases:
  `docs/plans/2026-09-21-task-l2-on-demand-language-packs-test-cases.md`.
  - Josh's decision 2026-09-21: **prepare first, offer later**. A non-built-in language is not
    selectable; it carries an `Add` button and becomes selectable only once a validated pack
    exists. The other four assumptions in the doc were approved as written.
  - Server: `src/report/language-pack.ts` (whole-pack validation — a missing key, a wrong value
    type or a lost `{placeholder}` rejects everything; an invented extra key is dropped),
    `src/report/language-pack-prompt.ts` (sends only the English pack plus the catalog's English
    name — no conversation content), `src/storage/language-pack-store.ts` (atomic cache at
    `data/locales/<code>.json`), `src/summarizer/language-pack-run.ts` (refusals before any
    provider runs, provider fallback, one shared run for concurrent requests).
    `src/summarizer/provider-order.ts` now holds `orderedProviders`/`providerName`, shared with
    `app.ts`. Routes: `GET /api/locales/:code`, `POST /api/locales/:code/build` (origin-checked;
    400 for a refusal, 502 for a build failure).
  - Web: `web/language-runtime.ts` (runtime load/build), a runtime pack registry in `web/i18n.ts`,
    a `status` field (`built-in`/`added`/`addable`/`unavailable`) in `web/language-options.ts`,
    the `Add` button with preparing/failed states in `web/LanguageSelector.tsx`, and a startup
    effect in `web/ZenJournal.tsx` that reloads a saved on-demand language's cached pack.
  - Building a pack deliberately does **not** require the summarizer permission: only the English
    UI strings leave the machine. It does use the provider already chosen in settings.
  - 365 tests pass and `npm run check` passes — run in the main session, not only by the subagent.
    Two review findings were fixed before the commit: the `Add` control had no CSS at all, and the
    provider reply-parsing helpers had been copy-pasted out of `summary-run.ts` (now exported and
    shared).
  - Checked in the browser against the real server on port 4317: built-ins first, `Add` on every
    addable language, and `ar`/`he`/`fa`/`ur` still shown as not available with no `Add`.
  - **Real end-to-end run done 2026-09-21 (after the `10f79ff` commit)**: pressed Add on Japanese in
    the real app with `agy` (Gemini) as the chosen provider. The row showed `準備中…`, the pack
    passed validation and was cached as `data/locales/ja.json` (5,248 bytes, all seven top-level
    sections), the row then became selectable with no Add button, choosing it switched the whole
    page to Japanese, and a reload came back in Japanese from the cached pack (L2-23). The saved
    summary permission followed to `ja` and was restored to `zh-TW` afterwards, as was the UI
    language. The failure row state is still unit-tested only — no real provider failure was forced.
  - Right-to-left layout remains a separate, still-open decision.
- **Task L3 done: right-to-left layout.** Design and the 17 approved test cases:
  `docs/plans/2026-09-21-task-l3-rtl-layout-test-cases.md`.
  - Josh chose this over leaving `ar`/`he`/`fa`/`ur` locked (my recommendation was to leave them
    locked; he decided otherwise and the four languages are now addable like any other).
  - `directionFor` in `src/report/languages.ts` is the single source of direction; `ZenJournal.tsx`
    sets `document.documentElement.dir` in the same effect as `lang`, so direction is always
    derived from the language and can never outlive it.
  - `web/styles.css`: 20 physical declarations became logical (`inset-inline-*`,
    `margin/padding/border-inline-*`, `text-align: start`). The two Constellation canvas
    coordinates (`left: var(--x)`, `left: 50%`) stay physical on purpose, with a comment and a
    test (L3-13) recording the exemption.
  - Day arrows swap glyph, not meaning: `dayArrowGlyphs` in `web/date-utils.ts`; the accessible
    labels are unchanged. `LocalActivityModal`'s own `DateSelector` gets the same direction, so
    the two steppers cannot disagree.
  - `unavailable` is gone from `web/language-options.ts` and `languageNotAvailable` from the three
    built-in packs; `refusalReason` no longer refuses RTL codes. Test L2-16 was rewritten as L3-16.
  - 380 tests pass (15 new) and `npm run check` passes — run in the main session.
  - Checked in the browser against the real server with `dir="rtl"` forced by hand (no provider
    call): header, view switcher, the Journal and Bento views and the report cards for 2026-09-18
    all mirror cleanly, with the key-milestone card intact.
  - **Real end-to-end run done 2026-09-21 (after the `002e4d9` commit)**: pressed Add on Arabic in
    the real app with `agy`. The pack was built and cached as `data/locales/ar.json` (5,714 bytes),
    the row became selectable, and choosing it set `lang="ar"` with `dir="rtl"` and put the whole
    interface into Arabic (`الإنجازات اليومية`, `الإعدادات`, `اليوم السابق`, the three view tabs).
    The 2026-09-18 report was checked in that state: cards, the key-milestone badge
    (`محطة رئيسية`), the source line and the evidence chips all mirror correctly. The report's own
    text stays Chinese, as it should — the report is data, generated in its own language.
    Afterwards the UI was returned to `zh-TW` and the saved permission was restored to `zh-TW`.
  - **Two findings from that run, both still open:**
    1. (Fixed by Task L4, below.) A cached language showed `Add` again after a page reload,
       because only the saved language's pack was fetched at startup.
    2. (Resolved, not a finding.) `data/locales/zh-CN.json` was added by Josh himself in the web
       page while L3 was being implemented. The L3 subagent's report was accurate.
- **Task L4 done: cached languages stay added.** Design and the 8 approved test cases (written in
  Given/When/Then, Josh's new house style for these docs):
  `docs/plans/2026-09-21-task-l4-cached-languages-stay-added-test-cases.md`.
  - `GET /api/locales` returns the codes with a pack on disk; `LanguagePackStore.list()` reads the
    cache directory, skipping anything that is not a parseable `.json` pack and treating a missing
    directory as an empty list. It never calls a provider.
  - The web app fetches that list once at startup. "Cached" (on disk) and "loaded" (in memory) are
    now two separate questions: `web/language-options.ts` asks the first, `getTranslations` the
    second. They are kept in two registries in `web/i18n.ts` on purpose.
  - Choosing a cached-but-unloaded language fetches its pack first and only then switches
    (`ensureLanguageLoaded`), so the page can never show English under another language's label.
  - 395 tests pass (15 new) and `npm run check` passes — run in the main session.
  - Checked in the browser against the real server: after a reload in `zh-TW`, all three cached
    languages (`zh-CN`, `ja`, `ar`) are listed straight after the built-ins as selectable with no
    `Add`; switching into Japanese showed real Japanese, then back to `zh-TW`. No provider call.
  - Small gap left open: choosing a language whose cache file has been deleted behind the app's
    back does nothing visible until the next listing. Within the approved L4-7 behavior, but a
    dead click.
- **Task 5 done: component tests.** Design and the 16 approved test cases:
  `docs/plans/2026-09-21-task-5-component-tests-test-cases.md`.
  - Josh chose `@testing-library/react` with `jsdom` over a real-browser runner, and decided
    that CSS and layout coverage waits for a separate end-to-end layer (now its own TODO line).
  - `test/web/LanguageSelector.test.tsx` (T5-1..T5-10) and `test/web/DateSelector.test.tsx`
    (T5-11..T5-15) render the components and click them. `test/web/build-output.test.ts` is down
    to one check (T5-16): the build produces a page with a root element and a script. Every
    bundle-string assertion is gone.
  - The default Vitest environment stays `node`; the two component files opt into jsdom with a
    `// @vitest-environment jsdom` docblock, because a global jsdom broke two existing tests that
    read files through `new URL(..., import.meta.url)`.
  - New dev dependencies: `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
  - 410 tests pass (15 new) and `npm run check` passes — run in the main session. The suite went
    from 2.78s to about 3.9s; the cost is jsdom setup for those two files.
- **Task S1 done: the 07:00 report window and the daily schedule.** Decisions:
  `docs/decisions/2026-09-21-seven-am-report-window.md` (supersedes the midnight boundary in the
  2026-09-17 cross-day decision). Test cases S1-1 to S1-18, approved by Josh:
  `docs/plans/2026-09-21-task-s1-seven-am-window-and-schedule-test-cases.md`.
  - Josh's decisions, 2026-09-21: schedule lives in launchd; run at 07:00; a report covers
    `[D 07:00, D+1 07:00)` and is filed under the starting day `D`; after several missed days only
    the most recent finished window is generated.
  - `reportDateFor` in `src/collector/local-collector.ts` is now the single place a record's day is
    decided. It shifts the *zoned wall clock* back seven hours, not the UTC instant, so a daylight
    saving change never skips or doubles a day.
  - New `src/schedule/`: `report-window.ts` (which day to generate), `run-scheduled-report.ts`
    (timezone → already generated? → permission → build → run), `entry.ts` (the job's Node entry
    point, wired like `server/index.ts` without the HTTP server), `launchd-plist.ts` and
    `launchd-install.ts`. `scripts/install-launchd.mjs` plus `npm run schedule:install` /
    `schedule:run`. Nothing ran `launchctl`.
  - A failed attempt writes no report: the runner is handed a capturing store, and the real store
    is written only after a provider actually succeeds (S1-15). Note the consequence — when every
    provider fails, the scheduled run leaves the day empty rather than saving the "unavailable"
    report the manual route keeps.
  - One existing test changed: `TZ-2` straddled local midnight, which is no longer a boundary; it
    now straddles 06:59:59 / 07:00:00 America/Los_Angeles.
  - 434 tests pass (24 new) and `npm run check` passes — run in the main session.
  - **Blocking gap, nothing verified end to end yet**: the job reads the stored report timezone
    from `data/report-timezone.json`, and nothing in the repository writes that file. Until it
    exists the job always declines with `no-timezone`. The 2026-09-17 timezone decision puts
    capturing it in the installer, which does not exist yet. That is the next piece of work.
  - Also still open: `web/date-utils.ts`'s `getYesterdayDate()` still assumes midnight, so the
    page's default date can disagree with the 07:00 window between midnight and 07:00.
- **Next frontend task**: Task 5 (replace bundle-string assertions in `test/web/*.test.ts` with component-level tests).
- **Not started**: Task 5.

## Completed

- Phase 1 foundation: `BRIEF.md`, canonical `AGENTS.md`, TypeScript skeleton, CI, and the `npm run check` gate.
- Phase 2 experience spike: the three-achievement constellation with expand/related interactions and narrow-screen layout.
- Phase 3 collector spike:
  - normalized Claude Code and Codex fixture parsing;
  - local-timezone date filtering, source/session identity, and malformed-line issue reporting;
  - metadata-first local API and browser panel;
  - local message preview fetched only after the user selects a session.
- Phase 3 first-read consent gate:
  - server-enforced source choice stored as ignored local JSON with no conversation contents;
  - absent, invalid, unreadable, or unsavable settings fail closed;
  - a collection keeps its saved scope until completion, then later choices apply to a later collection;
  - source selection and disclosure in the local page; completed results remain until a later collection succeeds.
- Phase 3 local timezone:
  - collection uses the executing computer's system timezone rather than a fixed Sydney timezone;
  - timezone boundary, non-Sydney, and invalid-timezone behavior are covered by synthetic unit tests.
- Unit-test framework:
  - all existing unit tests use Vitest, with one `npm test` command and no `node:test` or `node:assert` imports in the test suite.
- Phase 3 Claude Code parser verification:
  - verified common real local JSONL structure read-only with no content retained;
  - added synthetic Vitest coverage for timestamp validity, BOM/CRLF input, structured content, malformed input, source read-only behavior, and report-day session context;
  - verified that a real `fork-context-ref` metadata record is ignored while the same file's direct session remains available; future parent-only sidechain conversations are excluded to avoid duplicate counting.
- Phase 3 Codex parser verification:
  - verified recent active and archived JSONL structure read-only with no content retained;
  - added synthetic Vitest coverage for observed message and metadata shapes, timestamp and malformed input, report-day context, duplicates, and source read-only behavior;
  - duplicate IDs produce an incomplete result rather than duplicate sessions; stream reconciliation remains a separate task.
- Phase 3 source coverage states:
  - distinguishes a source that is not installed, has no report-day activity, or has incomplete data from an unreadable path, unsupported format, partial write, malformed record, or duplicate session;
  - preserves available data from one source while showing another selected source's incomplete state in the local page and collector API.
- Phase 3 session-file deduplication:
  - merges repeated or split files only within the same source and session ID;
  - preserves one exact duplicate message, merges distinct messages chronologically, and marks conflicting message IDs incomplete without guessing;
  - retains the report-day context rule after merging.
- Phase 3 exit review:
  - documented the evidence-backed local-source behavior, limitations, privacy
    boundary, and later work in [the exit review](docs/reviews/2026-09-17-phase-3-exit-review.md);
  - confirmed that Phase 3 does not claim a first-version release or support
    for the Chrome sources.
- Phase 4 external-summarization permission:
  - a separate, fail-closed local permission record stores the approved source
    scope, both permitted recipients, and optional CLI preference, without
    conversation contents;
  - the local API discloses the maximum permission before it is saved, defaults
    to Codex when both injected CLIs are usable, and permits a saved grant to
    cover scheduled fallback to Claude Code;
  - report-day conversation payloads must come from an injected server-side
    builder rather than a browser request; if each approved available runner
    fails, the API returns an incomplete result with both failure reasons. The
    current builder and runner are test-only; no real CLI is detected or
    invoked yet.

- Phase 4 report contract (2026-09-17/18):
  - 0–5 achievements with traceable evidence; malformed or over-limit output
    fails closed as incomplete; more than five triggers at most three attempts;
    status and coverage come only from local facts;
  - eight approved fictional evaluation cases and a deterministic scorer; no
    model has been run against them.
- Phase 4 provider readiness (2026-09-17/18):
  - sign-in controls, a zero-conversation readiness probe run only on request,
    and per-provider summary model and effort settings from fetched model
    lists with a built-in fallback; both real CLIs showed Ready, and Josh
    confirmed the real model and effort dropdowns.

## Important boundaries

- The collector must not transmit records, persist conversation text, or commit private data.
- The current development demo reads Josh's local data only because he explicitly authorized this in the conversation. A product user must receive a local-source consent and scope choice before the first read.
- Consent to read local histories is separate from consent to transmit complete same-day conversations to a chosen Claude Code or Codex summarizer.

## Next task

**Phase 5 as scoped is done** (`71f3987`, `ddc8c70`, `4c7922f`, the real run,
`45b606a`, `a80e313`, `e46f0c6`, `8d40af6`). The React + Vite migration is
now the active work: **Tasks 1–4 are done (`f1b5718`, `a7f7144`, `e342648`, and Task 4);
Task 5 (replace bundle-string assertions with component-level tests) is next.** See
"Current phase" above for the full 5-task order and why React was chosen
over Next.js.
Phase 6 (daily automation) and the cross-day "knowledge map" both wait
behind this migration.

### Phase 5 progress

Complete and verified, all with synthetic records and no CLI invoked unless
stated:

- Task NT, collector non-text placeholders (`2a652d5`).
- Task PB, server-side payload builder and evidence manifest (`3eda570`).
- Route wiring: `/api/reports/generate` defaults to `buildReportDayPayload`
  (`e237413`).
- Tool capping: `tool_use` capped (`bb20a83`), cap tightened to 250 (`77c4168`),
  then marker plus one per-kind window (`0915242`).
- Draft prompt and fictional eval payloads (`954b827`).
- **Real CLI runs against the fictional set (2026-09-18).** Codex `gpt-5.6-luna`,
  Claude Code `haiku`, Codex `gpt-5.6-terra`, and Claude Code `sonnet` each
  scored 7/8 on the first pass, all failing only case 05 (a cross-source
  activity that omitted one supporting record's ID). Full results, per-model
  timing, and the measured cost (haiku and sonnet each moved the 5-hour usage
  window by about 1 percentage point for 8 cases) are in
  [the run record](docs/evals/results/synthetic-set-02-run-2026-09-18.md).
- **Case 05 was found to be unstable, not deterministic**: repeating it alone
  on the unchanged prompt gave 0/6 passes, so the four-model 7/8 table cannot
  separate model ability from luck on that case (`70466f3`).
- **Prompt fix for case 05 (`5236667`, `96383df`)**: two rewrites that argued
  the citation rule more precisely in the "Rules" section made no measurable
  difference (3/7, then 3/8 on repeated case-05 runs). Annotating the
  `evidence` field inside the JSON output schema, plus a final line after the
  schema telling the model to re-scan every record before emitting JSON,
  moved it to 8/8. The full eight-case set then passed 8/8 twice in a row on
  haiku with zero critical failures and no regression, and separately 8/8 on
  Codex `gpt-5.6-luna` (`7873d05`). Cost: the re-scan step adds latency
  (haiku's slowest case went from ~23s to 48-79s).
- **Not yet run against the fixed prompt**: `gpt-5.6-terra` and `sonnet`. Every
  case except 05 has been observed at most twice, so their stability under
  repetition is unknown. The eval harness does not repeat cases automatically;
  each repetition above was driven by hand.
- **Real summarizer runner (`71f3987`)**: `createSummaryRunner`
  (`src/summarizer/summary-run.ts`) implements `SummaryRunner`: resolves the
  executable and the saved model/effort, runs up to three attempts with a
  fresh temp directory each, parses a Markdown-fenced or bare JSON reply,
  validates it, and re-analyses only on `too-many-achievements` (the
  retry/fallback rules were already decided by D1 in the
  [report contract design](docs/plans/2026-09-17-report-contract-design.md);
  this task only added the command shape and orchestration — see
  [the summary-run design](docs/plans/2026-09-18-summary-run-design.md)).
  It saves an `AchievementReportV1` on every attempt that gets a reply and
  throws, to trigger the existing per-provider fallback, only when no
  attempt ever replies or every attempt exceeds the achievement limit.
  Reuses the readiness probe's approved command flags (`claudeArgs`/
  `codexArgs` in `readiness-probe.ts`, now parametrized by prompt text
  instead of the fixed probe text; no behavior change to the probe).
  Also added `ReportDayPayload.timeZone`, so a saved report is never
  labelled in a different zone than it was collected in, and
  `AchievementReportStore` (`contract.ts`), a minimal save-only interface
  distinct from the existing `DailyReport`-typed `ReportStore` (decision 1
  below). SR-1 to SR-11 pass against fake processes/temp-dirs/store; four
  deliberate mutations were each caught. No real CLI is invoked by any test.
- **Report storage consolidated on `AchievementReportV1` (`ddc8c70`)**,
  resolving decision 1 below: `ReportStore` now stores the new shape instead
  of the old `DailyReport`. Retired the dead `DailyReport`/
  `generateSampleReport`/`sampleRecords` domain files, their `/api/reports/sample`
  route, and their tests — nothing in `web/app.ts` ever fetched that route
  (its constellation is still a hardcoded array), so no visible behavior
  changed. `/api/reports/latest` is unchanged in shape; it now just serves the
  new type.
- **Wired into the server (`4c7922f`)**: `createSummaryRunner` is constructed
  at startup (macOS only, when the model catalog loaded) and passed to
  `createApp`, sharing the existing executor/tempDirs/process runner. Fixed
  two gaps found while wiring, both present in every environment before this:
  `availableSummaryProviders` was never set (defaults to `[]`, so
  `/api/reports/generate` always returned 503 regardless of anything else),
  and `summaryPermissionPath` was never set (so saving external-summarization
  permission — the gate this whole feature sits behind — always threw
  outside tests). Both are now resolved once at startup by the same cheap
  `executor.locate` check, never a readiness check (that spends a real model
  call and only runs on explicit request, decision C1).
- Manually booted the real server: `GET /api/reports/latest` and
  `GET /api/summarizer/permission` both respond 200.
- **The first real run (2026-09-18), approved by Josh**: date 2026-09-09
  (measured as the lightest available day, 124KB / ~31k estimated tokens,
  `claude-code` only — see `scripts/experiments/measure-days.mts`), through
  the real `/api/summarizer/permission` and `/api/reports/generate` routes
  (`scripts/experiments/run-real-day.mts`, since the route itself only
  supports "today"), Claude Code `haiku` preferred. Result: `status:
  complete`, 3 achievements, each with real message-ID evidence; no
  fabricated completion (two items correctly note a commit not yet pushed /
  a job not yet applied to); `codex` correctly `no-activity` rather than
  incomplete. No leftover temp directory. Saved to `data/reports/latest.json`,
  replacing the stale pre-consolidation demo content that was there before.
- **The constellation UI now shows this (`45b606a`)**: `web/app.ts` fetches
  `/api/reports/latest` on load instead of three hardcoded sample
  achievements. Manually verified in the browser against the real
  2026-09-09 report (three real achievements, Expand works, date updates)
  and against a missing report (temporarily moved `latest.json` aside):
  a "No report has been generated yet." status line, no date. New
  `web/report-view.ts` holds the pure mapping (`mapAchievementsToNodes`,
  `describeIncomplete`, `layoutPosition` — a deterministic ellipse layout
  replacing the old hand-authored x/y coordinates); RV-1 to RV-3 cover it,
  three deliberate mutations each caught. Evidence is still not turned into
  child nodes — that stays the separate "source trace-back" task, so the
  "Related" control is now only shown on a node that actually has children.
- **Retention decided and implemented (`a80e313`)**: reports are kept
  indefinitely by default, one file per report date, no automatic deletion —
  a report holds a derived summary and evidence pointers, never raw
  conversation text, so this is a much lower privacy risk than keeping the
  underlying sessions would be. `ReportStore` now writes `<date>.json`
  instead of overwriting a single `latest.json`, and adds `read(date)` and
  `listDates()`; `readLatest()` is now "most recent date with a saved
  report" rather than "most recently saved" (they can differ if a past day
  is regenerated later — covered by its own test). Six cases pass; three
  deliberate mutations each caught. The one real report on disk was migrated
  to the new filename and reverified served correctly by the real server.
- **Source trace-back (`e46f0c6`)**: each achievement gets a "Show source"
  control. It fetches the local collector session for each evidence
  reference and shows only the cited messages, in evidence order — the
  existing consent-gated `/api/collector/sessions/:id` route now takes an
  optional `date` so trace-back can collect a past day as it was that day
  (the live "Local activity" panel is unaffected). `pickEvidenceMessages`
  and `isLocallyTraceable` (only `claude-code`/`codex` have a local
  collector; the other three sources are named but not previewable, since
  the Chrome add-on doesn't exist) are in `web/report-view.ts`; RV-4/RV-5
  cover both, three deliberate mutations each caught. Manually verified
  against the real 2026-09-09 report and real local history: saved
  local-source consent, opened "Show source" on all three achievements, and
  confirmed each showed only its own cited messages.
- **Edit and remove (`8d40af6`)**: `PATCH`/`DELETE /api/reports/:date/achievements/:id`,
  gated like the other local mutating routes. `PATCH` edits title/detail
  only (never id/category/evidence — a correction changes what is said, not
  what it is evidenced by); `DELETE` removes just that achievement, leaving
  status/coverage/incomplete untouched. `isValidAchievementEdit` in
  `contract.ts`; RE-a to RE-d and RE-1 to RE-11 cover the validator and
  route. Mutation testing caught a real test gap (a missing-Origin-header
  case) before the route's own origin check was confirmed load-bearing.
  `web/app.ts` gets Edit (inline form) and Remove (two-step
  Remove/Confirm remove). Manually verified against the real 2026-09-09
  report: edited a title (persisted), confirmed Cancel is a no-op, removed
  an achievement (persisted, down to two) — the real report was backed up
  first and restored byte-for-byte afterward.

### Phase 5 remaining

Every `TODO.md` checkbox under Phase 5 is checked. What is left is not a
Phase 5 deliverable, but work Josh raised mid-phase:

1. **Design the cross-day "knowledge map"** (decision 1 below), now that
   retention has removed the storage blocker. Still needed: a way to decide
   which achievements count as the same recurring theme across days, and
   what the UI does with more than one day's history — neither is designed
   yet, and neither is in `BRIEF.md`'s first-version scope, so treat this as
   its own scoped feature, not an extension of today's single-day view.
2. **The web UI framework decision** (new, 2026-09-18): Josh asked to move
   off the current framework-free TypeScript/DOM approach. Discussion
   pending — no framework has been named yet, so there is nothing to
   compare trade-offs on until that happens.

### Decisions parked, waiting on Josh

1. **What the UI shows.** Resolved: Josh explicitly abandoned the 3D star map /
   particle constellation after asking for a cleaner, simpler, and more aesthetic design.
   Replaced with the Zen Daily Journal (`web/ZenJournal.tsx`) supporting 3 switchable
   layouts (Journal, Bento, Briefing) and Light/Dark themes.
2. **Conversation order in the payload** follows the approved source scope rather
   than the clock, so a later Codex session can precede an earlier Claude Code
   one. Chronological order would read as one day.
3. **Eval cases 04 and 06** cannot show a two-sided exchange, because each
   approved manifest allows one message per record. Case 04's model confirmation
   is absent and case 06's CI output is pasted inside Josh's own message. Adding
   message IDs to the approved fixture is Josh's decision. Left as-is for now.

### Still not true

Cross-day historical synthesis / clustering across multiple dates into meta-themes
has not been built yet (date navigation between separate days is now supported
in `ZenJournal.tsx`, but there is no cross-day aggregation engine). Two providers
have been exercised on real data (Claude Code `haiku` and Gemini `gemini-3.8-flash`),
while Codex `gpt-5.6` was evaluated on synthetic fixtures and verified ready via probe.

## Measured payload cost (2026-09-18, local sizes only, nothing transmitted)

Across 2026-09-04 to 09-18 the daily payload ranged from 62k to 610k estimated
tokens, median 164k, mean 256k. Josh's volume is capped by Pro and Plus plan
limits, so heavier tiers will produce larger days; the design target is millions
of tokens per day, not 610k. At a realistic 150k per-request budget, 9 of 15 days
need splitting, so splitting is a core mechanism rather than an edge case.

Reading a day's records costs an estimated 1% (heaviest day) to 4% (median day)
of what it cost to create them, because each agent turn resends the growing
context. The ratio improves for heavier users. Prompt caching is not modelled and
would raise that share, perhaps toward 10%; one measured run against the usage
card is still needed to replace the estimate.

Capping `tool_use`, tightening the cap to 250, and then keeping the marker plus
one per-kind window instead of head and tail took the heaviest day from 610k to
406k estimated tokens (-33%) and the median day from 164k to 135k. The heaviest
day still exceeds a realistic per-request budget, so splitting remains required.
Remaining untaken levers: a cap of 100, defaulting to a cheaper summary model,
and per-conversation incremental summarization, which would also stop a session
that spans midnight being re-read on every day it is active.

Josh confirmed the changed NT-5 rule on 2026-09-18: `thinking` and `reasoning`
are excluded entirely, are never sent to the summarizer, and a message holding
only deliberation is dropped without counting as an issue. A visible count of
excluded records was declined.

Decided on 2026-09-18:

- payload format is simplified, minified JSON with structural IDs, and no
  coverage, timezone or version fields inside the payload;
- bulk tool output is capped head + tail, content-blind and disclosed
  ([decision](docs/decisions/2026-09-18-tool-result-truncation.md));
- non-text blocks become visible placeholders and no message vanishes silently.

Open design questions inside Task NT: whether to exclude `thinking` blocks (D1),
and whether to extend the contract's coverage-reason union to carry the
collector's `malformed-record` and duplicate reasons (D2).

Open decisions for the remaining report-generation items:

- splitting a day that exceeds model input limits without omission (deferred to
  a later task, to be decided on a measured `byteLength`);
- whether and how secrets inside conversations are masked before sending;
- where generated reports are stored and how the existing sample report UI is
  replaced (decision 1 under "Phase 5 remaining" above — the summary-run
  command, output handling, and retry/fallback wiring are now implemented);
- which real day Josh approves for the first real run, once index.ts wiring
  lands.

## Latest verification

- Light Theme & theme switcher (2026-09-19, `b26dcc3`): added soft warm slate
  background, crisp white cards, high-contrast typography, and emerald/violet
  accents for Light mode. Added ☀️/🌙 toggle in the header, persisted in
  `localStorage` as `daily_proof_theme`. Verified in browser across all 3 layout views.
  `npm run check` passed (26 test files, 279 tests).
- 3-Way Layout Switcher (2026-09-19, `11f01cd`): added top pill switcher for:
  1. 📖 Concept A: Minimal Journal (Linear / Raycast)
  2. 🍱 Concept B: Focus Bento (Apple / Things 3)
  3. 📝 Concept C: Executive Briefing (Notion / Axios)
  Persisted in `localStorage` as `daily_proof_view_mode`. Verified with real
  2026-09-09 data in browser. `npm run check` passed.
- Zen Daily Journal UI pivot (2026-09-19, `04662b0`): replaced heavy 3D React Flow
  constellation with `web/ZenJournal.tsx` (reduced bundle size from 414 kB to 229 kB,
  modules down to 18). Tested against real report with inline expandable evidence
  drawer, date navigation, inline editing (`PATCH`), and deletion (`DELETE`).
- Google Antigravity / Gemini CLI (`agy`) integration (2026-09-19, `1d40a7a`):
  integrated `agy` as a third first-class summarizer provider. Model catalog
  detected 14 local models via `agy models`. Readiness probe via `gemini-3.8-flash-low`.
  Summary runner executes `agy` and parses JSON envelope. Tested against real
  2026-09-09 data using `gemini-3.8-flash` and saved to `data/reports/2026-09-09.json`.
  7 unit test suites updated; all 279 tests pass.
- Universal concise prompt overhaul (2026-09-19, `95419c1`): rewrote prompt in
  `src/report/summary-prompt.ts` to strictly require 3-5 punchy conclusions (<40 chars),
  1-2 concise outcome sentences, negative decision credit, and no conversational audit
  jargon. Tested on real 2026-09-09 sessions.
- React Flow node interactions (2026-09-18, `e342648`): `AchievementNode`
  component ports Expand, Show source, Edit, and Remove into React Flow cards.
  Styles in `web/styles.css` adapted to `.achievement-card` for hover/focus
  controls, expanded detail, source session previews, and inline edit forms
  with text-button Save/Cancel. `npm run format:check`, `npm run lint`,
  `npm run typecheck` (server and web), and `npm run build` all pass.
- React Flow constellation (2026-09-18, `a7f7144`): browser-pane check
  against the real 2026-09-09 report — three achievement cards render with
  correct text, scroll-to-zoom works, no console errors — and against a
  temporarily removed report, the same empty state as the vanilla version
  (restored afterward). Two layout bugs (zero-size node, unresolvable
  container height) were only visible in the browser, not from the code.
  `npm run check` passed with 268 tests.
- React/Vite scaffold (2026-09-18, `f1b5718`): booted the real server on the
  new build; `GET /` served the built shell, both hashed asset requests
  (`/assets/*.js`, `/assets/*.css`) returned 200, no console errors. A
  literal and a percent-encoded `../` traversal attempt and a request for a
  nonexistent file all correctly 404. `npm run check` passed with 268 tests.
- Edit/remove (2026-09-18, `8d40af6`): browser-pane check against the real
  2026-09-09 report and real server — edited a title (persisted, correct on
  reload), confirmed Cancel is a no-op, removed an achievement (persisted,
  down to two achievements); the real report was backed up first and
  restored afterward. `npm run check` passed with 273 tests (RE-a to RE-d,
  RE-1 to RE-11 new); mutation testing caught a real test gap (added a
  no-Origin-header case) before the route's own origin check was confirmed
  load-bearing.
- Source trace-back (2026-09-18, `e46f0c6`): browser-pane check against the
  real 2026-09-09 report and real local Claude Code history — saved
  local-source consent, opened "Show source" on all three achievements,
  each showed only its own cited messages (checked against the network
  request and the rendered text), scrollable rather than overflowing after
  a CSS fix. `npm run check` passed with 258 tests (RV-4/RV-5 new, plus a
  server test for the date param); three deliberate mutations each caught.
- Retention (2026-09-18, `a80e313`): `npm run check` passed with 255 tests
  (6 report-store cases new/extended); three deliberate mutations each
  caught. Migrated the one real report on disk to `2026-09-09.json` and
  reverified with the real server that `/api/reports/latest` still serves it
  (`status: complete`, 3 achievements) after the storage change.
- Constellation UI on the real report (2026-09-18, `45b606a`): browser-pane
  check against the real 2026-09-09 report — three achievements render with
  their real text, Expand works, date shows `2026-09-09`, no `Related`
  button on any of them (no children yet) — and against a temporarily
  removed `latest.json` — "No report has been generated yet.", no date.
  `npm run check` passed with 251 tests (RV-1 to RV-3 new); three deliberate
  mutations each caught.
- First real run (2026-09-18): 2026-09-09 through the real permission and
  generate routes with Claude Code `haiku`. `status: complete`, 3
  achievements, all evidenced, no fabricated completion, `codex` correctly
  `no-activity`. No leftover temp directory.
- Server wiring (2026-09-18, `4c7922f`): booted the real server with
  `npx tsx src/server/index.ts`; `GET /` (static page), `GET /api/reports/latest`,
  and `GET /api/summarizer/permission` all returned 200. `npm run check`
  passed with 247 tests. No CLI was invoked and no summary was generated.
- Report storage consolidation (2026-09-18, `ddc8c70`): `npm run check`
  passed with 247 tests (down from 249: two DailyReport-specific tests
  replaced by one, one dead test file removed).
- Real summarizer runner (2026-09-18, `71f3987`): `npm run check` passed with
  249 tests (SR-1 to SR-11 new); four deliberate mutations on the
  retry/fallback logic were each caught. All against fake processes,
  temp-dirs, and store; no real CLI invoked, not wired into `index.ts` at that
  point (see the two entries above for what followed).
- Report contract Task 5 (2026-09-18): 41 report tests and `npm run check`
  with 200 tests passed on Node v24.20.0 before the report contract and
  evaluation-set items were marked complete. Josh confirmed the real effort
  dropdown after restarting the dev server.
- Summary effort setting Task P3: `npm run check` passed with 200 tests; all
  effort tests use fake lists or runners; the dropdown was viewed in the
  browser pane against fake lists. No real CLI received an effort option.
- Summary model setting real check (2026-09-17): after restarting the dev
  server, both providers showed fetched model lists without a fallback note,
  and a selection was saved through the dropdown.
- Summary model setting Task P2: `npm run check` passed with 189 tests; all
  catalog, settings, endpoint, and panel tests use fake lists or runners; the
  dropdown was viewed in the browser pane against fake lists.
- Readiness probe real check (2026-09-17): Josh clicked Check readiness on the
  running dev server, which had reloaded the P1 code; Codex and Claude Code both showed Ready. Which attempt
  passed, tool-disable effectiveness, and real failure paths remain unverified.
- Readiness probe Task P1: `npm run check` passed with format, lint,
  typecheck, 168 tests, and build. All probe, state, endpoint, and panel tests
  use fake runners or a fake service; the panel was viewed in the browser pane
  against a fake service. No real Codex or Claude Code probe has run.
- UI-first login demo (`docs/plans/2026-09-17-ui-first-cli-login-demo.md`): `npm run check` passed with format, lint, typecheck, 101 tests, and build. Provider CLIs were exercised only through `--help`; no real login, status, or probe command was run. The panel was viewed in the browser pane against a fake provider service. Josh then ran the manual demo for both providers: signed-out and signed-in states and the Terminal-launched browser login passed for Codex and Claude Code.
- Phase 3 exit review: `npm run check` passed with format, lint, typecheck, 63 tests, and build. DD-1 through DD-6 use only temporary synthetic source files because the current local snapshot has no duplicate session ID. No E2E test was run; product-wide E2E testing is deferred until all planned functionality is complete.
- The shell's default Node 25 fails to start because of a missing Homebrew library; use `/opt/homebrew/opt/node@24/bin` on `PATH` for the approved Node 24 runtime (verified v24.20.0).

## Handoff

**Update 2026-09-21 (read this first):** HEAD is `be95d91`, working tree clean, `npm run check` passes
with 319 tests. The dev server (`npm run dev`, port 4317) was left running and serves the current
build. Testing the language dropdown changes `summaryLanguage` in `data/summary-permission.json`
(it was restored to `zh-TW`). Next work is Task L2 (see "Next" under the L1 entry above), starting
with writing its test cases for Josh's approval. Josh's working style, unchanged: decisions one at a
time, plain explanations, approve test cases before code, short answers led by one next action, and
replies in English first then Traditional Chinese.


Written 2026-09-19 at a session boundary; Josh's next session may be with a
different agent CLI (Codex or "Antigravity"), so this assumes no memory of
this conversation, only this repo's files.

- Checkout: `/Users/joshtsai/Documents/agent-daily-achievements`, branch
  `master`.
- Exact dev server command (user rule):
  `cd /Users/joshtsai/Documents/agent-daily-achievements && npm run dev`
  Server runs at `http://127.0.0.1:4317/`.
- Runtime: always put `/opt/homebrew/opt/node@24/bin` first on `PATH`; the
  shell's default Node 25 fails to start (missing Homebrew library). Gate:
  `npm run check` — runs format, lint, two `tsc` passes (server, then
  `-p tsconfig.web.json` for the web app's JSX/DOM types), Vitest, then the
  build (`tsc` + `vite build`).
- Merge verification rule (user rule): ALWAYS run `npm run lint` and verify
  before merging any branches into `main`.
- Completed features:
  - **Google Antigravity History Collector**: Added `"antigravity"` to `LocalSource` and `ReportSource`. Parses `~/.gemini/antigravity/brain/**/transcript.jsonl`, unwraps `<USER_REQUEST>`, maps tool calls and tool results, excludes thinking steps and system messages.
  - **Date Picker & Default to Yesterday**: Web UI (`web/ZenJournal.tsx`) initializes `selectedDate` to yesterday (`getYesterdayDate()`), with intuitive quick controls (`←`, `Yesterday`, `Today`, `→`, and date input), plus on-demand summary generation for any date.
  - **Stdin Streaming for Large Payloads**: Passed prompts to `agy` via `stdin` piping rather than CLI argument to permanently resolve OS `ARG_MAX` limitation on busy days with hundreds of messages.
  - **Full Settings Modal & Unified Language**: Modal in ZenJournal with model select for `agy`, `claude-code`, and `codex`, Effort picker, readiness test, unified language toggle (`zh-TW` / `en`), and summary regeneration.
  - **Real End-to-End Report Generation (2026-09-18)**: Successfully generated a complete daily report for 2026-09-18 using `agy` (Gemini 3.8 Flash), identifying 5 key achievements with "Complete local login flow and live verification" designated as the primary milestone (`isPrimary: true`).
- Summarizer & Prompt:
  - Universal concise prompt in `src/report/summary-prompt.ts`: strictly 3-5 punchy
    items (<40 chars), 1-2 outcome sentences, negative decision credit, no audit jargon.
  - Three first-class providers supported: `agy` (Google Antigravity / Gemini CLI),
    `claude-code`, and `codex`.
- Local state that already reflects real use, not synthetic data:
  `data/local-sources.json`, `data/summary-permission.json`, and
  `data/reports/2026-09-09.json`, `data/reports/2026-09-18.json`, and `data/reports/2026-09-19.json`.
- Key documents for the current work:
  `web/ZenJournal.tsx` (primary UI), `web/SettingsModal.tsx` (settings), `web/styles.css` (themes and layout styles),
  `src/collector/local-collector.ts` (source collection), `src/summarizer/summary-run.ts`
  (multi-provider execution runner).
- Working agreement observed with Josh:
  - follow `AGENTS.md` (canonical);
  - bring decisions one at a time with options and a recommendation;
  - run `npm run check` and verify before claiming tasks complete;
  - never transmit raw conversation data without saved consent.
