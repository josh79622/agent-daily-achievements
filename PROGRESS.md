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
- **Not started**: Tasks 4–5.

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
now the active work: **Tasks 1–3 are done (`f1b5718`, `a7f7144`, `e342648`);
Task 4 (port the Local activity and Report sign-in panels) is next.** See
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

1. **What the UI shows.** Resolved: the constellation now fetches and
   renders the real `/api/reports/latest` (`45b606a`), with empty/no-report
   states. **Cross-day "knowledge star map" idea (raised this session,
   still open)**: nodes as recurring themes/projects rather than one day's
   achievements, connected across days as they recur. Judged a good fit for
   the actual problem (accumulated progress, not a daily snapshot). Its
   storage blocker is now removed (retention, `a80e313`), but the design
   itself has not started — see item 3 under "Phase 5 remaining" for what
   is still undecided.
2. **Conversation order in the payload** follows the approved source scope rather
   than the clock, so a later Codex session can precede an earlier Claude Code
   one. Chronological order would read as one day.
3. **Eval cases 04 and 06** cannot show a two-sided exchange, because each
   approved manifest allows one message per record. Case 04's model confirmation
   is absent and case 06's CI output is pasted inside Josh's own message. Adding
   message IDs to the approved fixture is Josh's decision. Left as-is for now.

### Still not true

No UI reads more than one date: `ReportStore` now keeps history
(`a80e313`), but `/api/reports/latest` and the constellation still only ever
show the single most recent one — nothing yet lists or displays multiple
days. The report contract, real summarizer run, and constellation UI have
now all been exercised against one real day (2026-09-09) end to end,
including the browser render — this is no longer only tested against fakes,
but it is still exactly one day, one provider (Claude Code haiku), and one
machine.

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

Written 2026-09-18 at a session boundary; Josh's next session may be with a
different agent CLI (Codex or "Antigravity"), so this assumes no memory of
this conversation, only this repo's files.

- Checkout: `/Users/joshtsai/Documents/agent-daily-achievements`, branch
  `master`, working tree clean at handoff.
- Runtime: always put `/opt/homebrew/opt/node@24/bin` first on `PATH`; the
  shell's default Node 25 fails to start (missing Homebrew library). Gate:
  `npm run check` — runs format, lint, two `tsc` passes (server, then
  `-p tsconfig.web.json` for the web app's JSX/DOM types), Vitest, then the
  build (`tsc` + `vite build`).
- Dev server: `npm run dev` from the checkout
  (`http://127.0.0.1:4317/`). No web hot-reload yet — a `web/` change needs
  a fresh `npm run dev` (or `npm run build`) to show up, since the React
  side has no dev-server proxy set up, only a production `vite build`. On
  startup the server sweeps stale probe temp directories, fetches model
  lists, and checks which summarizer executables are locatable (a cheap
  `locate`, never a readiness check or a model call).
- **Active work: migrating the web UI from framework-free TypeScript/DOM to
  React + Vite, in 5 tasks (see "Current phase" at the top of this file for
  the full reasoning and order). Tasks 1–3 are done; Task 4 (port the
  Local activity and Report sign-in panels) is next.** Read that "Current
  phase" section before starting Task 4. Each task is expected to temporarily
  leave the page less capable than the vanilla-DOM version it replaced; that
  is the plan, not a regression to fix mid-task.
- Local state that already reflects real use, not synthetic data:
  `data/local-sources.json` (`claude-code` consented), `data/summary-permission.json`
  (`claude-code`/`codex` both permitted, `claude-code` preferred), and
  `data/reports/2026-09-09.json` (one real generated-and-edited report —
  see "Phase 5 progress" above for what was verified against it). All are
  git-ignored local files, not committed.
- Key documents for the current work: this file's "Current phase" section
  (framework decision and 5-task order), `web/Constellation.tsx` and
  `web/report-view.ts` (the pure logic it reuses, still covered by
  `test/web/report-view.test.ts`), `web/styles.css` (has both the old
  Expand/Related/Show-source/edit-form rules Task 3 will adapt, and the new
  `.achievement-card`/`.constellation` rules Task 2 added).
- Earlier key documents: [summary-run design](docs/plans/2026-09-18-summary-run-design.md),
  [payload and manifest design](docs/plans/2026-09-18-report-day-payload-design.md),
  [tool truncation decision](docs/decisions/2026-09-18-tool-result-truncation.md),
  [report contract design](docs/plans/2026-09-17-report-contract-design.md),
  [readiness probe, model, effort, and leak-fix design](docs/plans/2026-09-17-readiness-probe-design.md),
  [Phase 4 exit review](docs/reviews/2026-09-18-phase-4-exit-review.md).
- Working agreement observed with Josh, worth continuing regardless of
  which agent is driving:
  - follow `AGENTS.md` (canonical) and the AI-assisted development process
    linked from `BRIEF.md`;
  - bring decisions one at a time with options and a recommendation; do not
    bundle several decisions into one question;
  - propose test cases (with fixed IDs for product-behavior tests) before
    writing test code; run `npm run check`; mutation-check important tests
    by deliberately breaking the logic and confirming the test catches it;
    commit each meaningful part; record only verified status, and say
    plainly when something is not yet verified;
  - ask before any real CLI or model run, and state exactly what it sends;
    never read or transmit conversation history without saved consent;
  - when changing shared files (`PROGRESS.md`, `TODO.md`, `AGENTS.md`),
    read the current version first — Josh or another agent may have
    changed them since this was written.
