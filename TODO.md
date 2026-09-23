# TODO

## Phase 3 — Consented local collection

- [x] Define a shared local session/message/issue model for Claude Code and Codex fixtures. (`951bb03`)
- [x] Add a metadata-first local collector panel and on-demand preview API. (`976cb44`)
- [x] Require explicit first-read consent and source scope before collector access. (`3a4946d`, `85e1ee9`, `30b6985`)
  - Josh confirmed the scope, tests, and immutable in-flight collection behavior in [the consent design](docs/plans/2026-09-16-local-source-consent-design.md). The task passed its unit tests and `npm run check`; no E2E test was run.
- [x] Use the executing computer's timezone for local collector date boundaries. (`d4ee881`)
  - TZ-1 through TZ-4 in `test/collector/local-timezone.test.ts` passed with synthetic records; no E2E test was run.
- [x] Migrate all unit tests to Vitest as the project's single runner. (`62dc887` and follow-up commit)
  - Existing behavior is preserved in 29 passing Vitest tests; no E2E test was run.
- [x] Verify Claude Code parsing against approved real local sessions: timestamps, role/content extraction, session identity, partial/malformed input. (`58035cc` and follow-up commits)
  - Common primary-session and fork-context structure passed read-only verification and CC-1 through CC-12 synthetic unit tests; see [the verification record](docs/research/2026-09-17-claude-code-parser-verification.md). No E2E test was run.
- [x] Verify Codex parsing against approved real local sessions: timestamps, role/content extraction, session identity, active/archived overlap, partial/malformed input. (`de44eb0` and follow-up commit)
  - Recent active and archived structure passed read-only verification and CD-1 through CD-9 synthetic unit tests; see [the verification record](docs/research/2026-09-17-codex-parser-verification.md). No E2E test was run.
- [x] Surface absent source, unreadable source, unsupported shape, and partial-write state as distinct incomplete coverage. (`738668a` and follow-up commit)
  - IC-1 through IC-6 distinguish not-installed, no-activity, and incomplete coverage with a reason, while preserving an available second source. No E2E test was run.
- [x] Add session-file deduplication so one resumed or repeated stream is not counted twice. (`163dc08` and follow-up commit)
  - DD-1 through DD-6 merge exact and split streams, retain source boundaries, and mark conflicts incomplete. The current local snapshot has no duplicate ID, so this behavior uses synthetic unit tests only; no E2E test was run.
- [x] Run the Phase 3 exit review and document which source behavior is actually supported.
  - The evidence-backed support boundary and remaining limitations are in [the Phase 3 exit review](docs/reviews/2026-09-17-phase-3-exit-review.md). No E2E test was run; product-wide E2E testing is deferred until all planned functionality is complete.

## Later phases

### Large payload chunking (designed, not implemented)

- [ ] Split a report day above the shared safe input budget and merge its
      validated chunk summaries without omitting source material.
  - Shared ~64k-token policy and CH-1 to CH-9 are in
    [the chunking design](docs/plans/2026-09-23-large-payload-chunking-design.md).

### Phase 4 — Report intelligence (complete as scoped, 2026-09-18)

- [x] Confirm user consent for external summarization separately from local-source consent.
  - The local API stores a fail-closed maximum-permission grant with approved
    source scope, both possible CLI recipients, and an optional CLI preference.
    Eight synthetic Vitest cases cover blocked requests, disclosure, default
    selection, scheduled fallback, both-runner failure, later
    permission/preference changes, server-built payloads, and recipient
    persistence. It does not detect or invoke a real provider yet.
- [x] Detect available selected Claude Code/Codex CLI and represent failures without silent fallback.
  - Marked complete by Josh's decision on 2026-09-18 with known limitations:
    Codex tool removal has canary evidence (no file read outside the working
    directory) but no proof that every tool is disabled; Codex `max`/`ultra`
    effort acceptance is unverified by choice (no model-call check); real
    quota-exhaustion exit codes cannot be triggered safely; the real "Ready
    via …" panel text has not been observed.
  - UI-first login demo (`22a043c`, `3e2d7e3`, `c861af4`, `9237703`): a
    "Report sign-in" panel shows both providers, launches only the fixed
    `codex login` / `claude auth login` command in Terminal on macOS, and
    reports five safe states. Unit tests use fake executors only.
  - Josh's manual demo passed for both providers on 2026-09-17: signed out
    showed `sign-in-required`; each button opened Terminal, which started that
    provider's own browser login; after login, Check again showed signed in and
    never `ready`. The intermediate `login-in-progress` display was not
    observed manually.
  - Readiness probe decisions A–E approved in
    [the probe design](docs/plans/2026-09-17-readiness-probe-design.md).
    Task P1 (`fa9e628`, `5b9c77a`, `8bd1ef5`, `b134e73`): PR-1 through PR-17
    pass with fake runners and a fake service; `npm run check` passed (168
    tests); the panel was checked in the browser against a fake service. No
    real probe had run at that point.
  - Josh's first real checks on 2026-09-17 (served by the running `npm run dev`
    watcher, which had reloaded the P1 code; the Ready responses came from the
    readiness route that exists only in P1):
    Codex showed "Ready (checked 22:43)" and Claude Code "Ready (checked
    22:45)". This verifies that both real CLIs accepted the approved commands
    and that the reply channels (Codex `-o` file, Claude Code JSON reply field)
    produced a non-empty reply; no probe temporary directory was left behind.
    Not verified: which attempt passed (the panel does not show whether the
    lowest-cost or summary model succeeded), whether the Codex `--disable`
    switches remove every tool, failure-path exit codes with real CLIs, and
    that no session was persisted.
  - Task P2 summary model setting (`d9b114d`, `b59b41f`, `fc3d861`,
    `3c61d29`): MC, SM, SR, SE, and SP cases pass with fake model lists and
    runners; `npm run check` passed (189 tests); the dropdown was checked in
    the browser against fake lists. Model lists load at server startup
    (Codex `codex debug models`, Claude Code initialize-only request) with a
    built-in fallback.
  - Real check on 2026-09-17 (dev server restarted 23:41): both dropdowns
    showed fetched lists with no fallback note — Codex GPT-5.6-Sol,
    GPT-6-Astra, GPT-5.6-Terra, GPT-5.6-Luna, GPT-5.5; Claude Code Sonnet,
    Fable, Opus, Haiku. Josh's selections (Codex `gpt-5.6-terra`, Claude Code
    `opus`) were saved to the owner-only settings file. Not yet verified with a
    real CLI: that the probe's second attempt passes the selected model.
  - Task P3 summary effort setting (`247ebe5`, `4a8c3f4`, `990737a`,
    `d4d39ce`): EC, ES, ER, EE, EP, and EU cases pass with fake lists and
    runners; `npm run check` passed (200 tests); the effort dropdown was
    checked in the browser against fake lists. Not yet verified with a real
    CLI: that Codex accepts `-c model_reasoning_effort` values such as `max`
    or `ultra`, and Claude Code `--effort`, in a probe second attempt or a
    summary run.
  - Josh restarted the dev server on 2026-09-18 and confirmed the effort
    dropdown options match each model. Still not verified with a real CLI:
    an effort option actually passed in a probe second attempt or summary run.
  - Follow-up verification on 2026-09-18 (see the probe design): with Wi-Fi
    off, both providers reported `timed out` (no false Ready); a metadata-only
    before/after snapshot around one real check per provider found no new
    session files; local `codex debug prompt-input` checks could not verify
    tool removal or effort values.
  - One approved Codex canary run replied `NOACCESS` and could not read a
    fictional token outside its working directory. Codex `max`/`ultra` effort
    acceptance is a known limitation (no model-call verification approved).
    Found empty leaked probe temporary directories from interrupted startup
    fetches (reproduced when the dev watcher restarted mid-fetch); removed.
    Fixed with shutdown cleanup plus a startup sweep (LK-1 to LK-3); verified
    end to end on a separate server instance.
  - Attempt display PR-18/PR-19 (`4fb350e`): the panel shows "Ready via
    lowest-cost model" or "Ready via summary model"; `npm run check` passed
    (203 tests); the real panel text has not been observed.
- [x] Define the report contract: 0–5 achievements (Josh changed the cap from three on 2026-09-17), evidence links, incomplete coverage, and achievement-level deduplication.
  - Design, decisions D1–D3, and RC/RA/RS/EV cases approved in
    [the report contract design](docs/plans/2026-09-17-report-contract-design.md).
  - Task 1 validation: RC-1 through RC-9 pass in
    `test/report/report-contract.test.ts` (16 tests) and `npm run check`
    passed.
  - Task 2 assembly: RA-1 through RA-5, plus the RC-1/RC-2 status wording,
    pass in the same file (22 tests); `npm run check` passed.
  - Task 3 re-analysis decision: RS-1 through RS-4 pass in
    `test/report/summary-retry.test.ts` (plus a limit constant and an
    attempt-range guard); `npm run check` passed. No summarizer is run.
  - Task 4 eval scorer: EV-1 through EV-9 pass in
    `test/report/eval-scorer.test.ts` (13 tests) against
    `test/fixtures/report-eval/synthetic-set-02.json`; six deliberate scorer
    mutations were each caught; `npm run check` passed. No model was run
    against the set.
  - Task 5 (2026-09-18): the 41 report tests and `npm run check` (200 tests)
    passed again before marking this item complete. Scope as implemented:
    evidence is traceable by source, record ID, and optional message IDs;
    clickable trace-back links belong to Phase 5. Deterministic validation
    rejects exact duplicates (same category and evidence set); semantic
    duplicates across different evidence are checked by the eval scorer and
    human review, not by the validator. No real summarizer is connected.
- [x] Expand the pre-labelled evaluation set before prompt iteration.
  - Eight fictional cases with predetermined required, forbidden, duplicate,
    source-ID, and coverage expectations were approved on 2026-09-17 in
    [synthetic set 02](docs/evals/synthetic-set-02.md) and made
    machine-readable in `test/fixtures/report-eval/synthetic-set-02.json`,
    scored by `src/report/eval-scorer.ts`.
  - Real runs on 2026-09-18: Codex `gpt-5.6-luna`/`gpt-5.6-terra` and Claude
    Code `haiku`/`sonnet` each scored 7/8, all failing only case 05. Case 05
    was then shown to be unstable under the original prompt (0/6 on repeats),
    so that 7/8 figure cannot separate model ability from luck. See
    [the run record](docs/evals/results/synthetic-set-02-run-2026-09-18.md).
  - Prompt iteration (`5236667`, `96383df`) found that rewording the citation
    rule in prose did not move the result, but annotating the `evidence` field
    in the JSON schema plus a final re-scan instruction after the schema did:
    case 05 went to 8/8 on both haiku and Codex `gpt-5.6-luna`, and the full
    set passed 8/8 twice on haiku and once on Codex with zero critical
    failures. Not yet run against this prompt: `gpt-5.6-terra` and `sonnet`.
    Every other case has been observed at most twice; the harness has no
    built-in repetition, so each repeat above was driven by hand.

### Phase 5 — Report control

Phase 4 was closed as scoped on 2026-09-18 (Josh, option B in the
[Phase 4 exit review](docs/reviews/2026-09-18-phase-4-exit-review.md)); report
generation moved here and comes first.

- [x] Represent non-text conversation content in the collector instead of
      dropping it: (`2a652d5`)
  - NT-1 to NT-8 pass in `test/collector/non-text-content.test.ts`;
    `npm run check` passed with 215 tests; six deliberate mutations were each
    caught. All records are synthetic; no E2E test was run.
  - Two corrections during implementation: Codex text blocks are `input_text`
    and `output_text` (not `text`), and the approved NT-5 case was changed
    because a deliberation-only message must be dropped without an issue —
    Codex writes a `reasoning` payload per turn, so counting it would mark
    nearly every real Codex day incomplete. Josh confirmed this rule on
    2026-09-18 and declined a visible count of excluded records.
  - Original scope: `image`, `tool_use`, `tool_result` and unrecognized blocks
      become visible placeholder parts, and a message left with no representable
      content counts as an issue rather than vanishing. Verified defect: of four
      synthetic messages, an image-only message and a `tool_use` message were
      dropped with `issues: 0` and `state: "available"`, so a day was reported
      complete while content was missing. Losing `tool_use` / `tool_result` also
      removes the execution evidence that separates a stated intention from a
      completed task. Test cases NT-1 to NT-8 in
      [the payload design](docs/plans/2026-09-18-report-day-payload-design.md).
- [x] Build the server-side report-day payload and evidence manifest from
      collected sessions. (see the commit for this item)
  - PB-1 to PB-13 pass in `test/report/report-day-payload.test.ts`;
    `npm run check` passed with 228 tests; twelve deliberate mutations were each
    caught. Synthetic records only; nothing was transmitted and no CLI ran.
  - `CollectionSummary` now carries the `timeZone` its day boundaries were
    computed in, so payload times cannot be labelled in a different zone, and
    the contract's coverage reasons were extended per D2.
  - PB-5 initially passed against a fake collector that filtered by scope
    itself, so it tested the fake rather than the builder; a mutation that
    removed the builder's own scope check went undetected. The fake is now
    deliberately over-broad.
  - Wired into `/api/reports/generate` as the default `SummaryRequestFactory`;
    RG-1 to RG-5 in `test/server/report-generation.test.ts` cover the route, and
    four wiring mutations were each caught. No day has been measured and no CLI
    has run.
      Original scope: Format approved on 2026-09-18: simplified, minified
      JSON with structural IDs, no coverage or version fields inside the
      payload. Bulk tool output is capped head + tail, content-blind and
      disclosed, per
      [the truncation decision](docs/decisions/2026-09-18-tool-result-truncation.md).
      Test cases PB-1 to PB-13 in
      [the payload design](docs/plans/2026-09-18-report-day-payload-design.md).
      Payload chunking decision (2026-09-22): use one shared conservative
      input limit for every provider; see
      [the decision](docs/decisions/2026-09-22-summary-payload-chunking.md).
      The numeric limit and chunk/merge implementation remain unstarted.
      Still undecided: whether secrets inside conversations are masked before
      sending.
- [x] Cap `tool_use` text the same way as `tool_result`, content-blind and
      disclosed. (see the commit for this item)
  - PB-14 to PB-16 pass, PB-7/PB-8 were tightened to pin the exact truncated
    output, and `npm run check` passed with 236 tests. Eight deliberate
    mutations were each caught, including three off-by-one slicing errors that
    the original looser assertions had missed.
  - Measured on real records: `tool_use` was 24.6% of a day's content at 1,134
    bytes per part, because `Edit`/`Write` carry whole file contents. The
    heaviest day fell from 610k to 510k estimated tokens, and to 443k after
    Josh tightened the cap from 500 to 250 head and tail, and to 406k after he
    chose marker + one per-kind window over head and tail. Tests are written
    against the constant, so the cap change itself needed no test edits.
  - PB-17 was added for the point of the asymmetry: a truncated part never loses
    the tool name or the ok/error outcome. Eight mutations were each caught,
    including both window sides and the marker.
- [x] Run the selected summarizer CLI on that payload under saved permission,
      with the approved model, effort, tool restrictions, re-analysis limit
      (three attempts), and fallback rules, assembling an `AchievementReportV1`.
      **Implemented, storage consolidated, and wired 2026-09-18**
      (`71f3987`, `ddc8c70`, `4c7922f`): `createSummaryRunner`
      (`src/summarizer/summary-run.ts`) resolves the executable and saved
      model/effort, runs up to three attempts with a fresh temp directory,
      parses a Markdown-fenced or bare JSON reply, validates it, and
      re-analyses only on `too-many-achievements`; it saves an
      `AchievementReportV1` on every attempt that gets a reply and throws
      (to trigger the existing per-provider fallback) only when no attempt
      ever replies or every attempt exceeds the limit. SR-1 to SR-11 pass
      against fake processes/temp-dirs/store; four deliberate mutations were
      caught. Design: [summary-run design](docs/plans/2026-09-18-summary-run-design.md).
      `ReportStore` now stores `AchievementReportV1` directly (the old
      `DailyReport`/sample route/domain files were retired — nothing in
      `web/app.ts` ever rendered them), and `src/server/index.ts` constructs
      the real runner at startup with a real executable locator, also fixing
      two previously-dead settings (`availableSummaryProviders`,
      `summaryPermissionPath`) that made this route always fail regardless.
      Manually verified the real server boots and serves `/api/reports/latest`
      and `/api/summarizer/permission`.
  - [x] **First real run, 2026-09-18** (Josh approved): 2026-09-09 (lightest
        available day, ~31k estimated tokens, measured with
        `scripts/experiments/measure-days.mts`), through the real
        permission/generate routes with `reportDate` overridden for the
        test (`scripts/experiments/run-real-day.mts`, since the route
        itself only supports "today"), Claude Code `haiku` preferred.
        `status: complete`, 3 evidenced achievements, no fabricated
        completion, `codex` correctly `no-activity`. Saved to
        `data/reports/latest.json`, replacing the stale pre-consolidation
        demo content.
  - [x] **Constellation UI connected, 2026-09-18** (`45b606a`): `web/app.ts`
        fetches `/api/reports/latest` instead of showing three hardcoded
        sample achievements. New `web/report-view.ts` (pure, unit-tested:
        RV-1 to RV-3) maps achievements to nodes with a deterministic
        layout and describes incomplete reasons in plain language.
        Manually verified against the real 2026-09-09 report and against a
        missing report in the browser pane. Evidence is still not turned
        into child nodes; the "Related" control now only shows when a node
        has children.
- [x] Source trace-back in the report UI. (`e46f0c6`)
  - Each achievement gets a "Show source" control that fetches the local
    collector session for each evidence reference and shows only the cited
    messages, in evidence order. Reuses the existing consent-gated
    `/api/collector/sessions/:id` route, extended with an optional `date`
    query param so a past day is collected as it was that day (the live
    "Local activity" panel is unaffected, still defaulting to today).
  - `web/report-view.ts` adds `pickEvidenceMessages` (order preserved,
    missing cited ids reported rather than dropped) and `isLocallyTraceable`
    (only `claude-code`/`codex` have a local collector; the other three
    `ReportSource` values are named but not previewable, since the Chrome
    add-on doesn't exist). RV-4/RV-5 cover both; three deliberate mutations
    each caught.
  - Manually verified against the real 2026-09-09 report: saved local-source
    consent through the existing panel, clicked "Show source" on all three
    achievements, confirmed each shows only its cited messages (checked
    against the network request and the rendered text). A CSS pass
    (`.evidence`, `.has-source`) was needed after the panel first overflowed
    and overlapped sibling nodes.
- [x] Edit and remove incorrect achievements. (`8d40af6`)
  - New `PATCH`/`DELETE /api/reports/:date/achievements/:id`, gated the same
    way as the other local mutating routes. `PATCH` edits title/detail only
    — never `id`, `category`, or `evidence`, since a correction changes
    what is said, not what it is evidenced by. `DELETE` removes just that
    achievement; report status/coverage/incomplete are untouched (zero
    achievements is already a valid `complete` report).
  - `isValidAchievementEdit` (`contract.ts`): non-empty, in-limit
    title/detail, no other keys. RE-a to RE-d and RE-1 to RE-11 cover it and
    the route; mutation testing caught a real test gap (a no-Origin-header
    request wasn't tested, so removing the state-changing method's own
    origin check went unnoticed until that case was added).
  - `web/app.ts`: each achievement gets Edit (inline form, Save/Cancel) and
    Remove (two-step Remove/Confirm remove, never a bare one-click delete).
    Manually verified against the real 2026-09-09 report: edited a title
    (persisted, correct on reload), confirmed Cancel leaves all three
    untouched, removed one (persisted, down to two). The real report was
    backed up before the remove test and restored afterward.
- [x] Define and enforce local retention. (`a80e313`)
  - Josh decided 2026-09-18: reports are kept indefinitely by default, one
    file per date, no automatic deletion — a report holds a derived summary
    and evidence pointers, never raw conversation text, so the privacy risk
    of keeping it is much lower than keeping the underlying sessions.
  - `ReportStore` now writes `<date>.json` instead of overwriting a single
    `latest.json`, adds `read(date)` and `listDates()`, and `readLatest()` is
    now "the most recent date with a saved report" rather than "the most
    recently saved" (they can differ if a past day is regenerated later).
    Six cases pass; three deliberate mutations were each caught.
  - Migrated the one real report on disk to the new per-date filename; this
    unblocks the cross-day "knowledge map" idea (decision 1 in
    `PROGRESS.md`) — there is now a place for history to accumulate, though
    nothing reads more than one date yet.

### Web UI framework migration (raised by Josh 2026-09-18, mid-Phase-5)

Not a Phase 5 deliverable — Josh asked to move the web UI off framework-free
TypeScript/DOM onto React + Vite (chosen over Next.js; see "Current phase"
in `PROGRESS.md` for the full reasoning). The constellation uses React Flow
(`@xyflow/react`), picked partly because its nodes/edges will also suit the
undesigned cross-day "knowledge map" idea (decision 1 in `PROGRESS.md`).
Five tasks, each expected to temporarily leave the page less capable than
the version it replaces until the next task restores that piece — not a
regression to fix mid-task.

- [x] Task 1: scaffold Vite + React + a proof-of-build shell; server
      untouched. (`f1b5718`)
- [x] Task 2: constellation on React Flow, fetching the real report; same
      no-report/zero-achievements/incomplete states as before. Two real
      layout bugs (a zero-measured node, an unresolvable container height)
      found only by checking the browser. (`a7f7144`)
- [x] Task 3: port Expand/Show source/Edit/Remove into the React Flow node
      component (`web/Constellation.tsx`). `web/styles.css` rules adapted to
      `.achievement-card`. (`e342648`)
- [x] UI Overhaul: Cosmic Constellation (Style A) with radiating satellite nodes,
      flowing edges, session inspection modal, and corner theme color palette (`45eb363`).
- [x] Refocus on core value & prompt overhaul (`95419c1`):
      Josh noted 3D stars/particles drifted from the core goal (daily cognitive relief).
      Prompt overhauled: 3-5 punchy conclusions (<40 chars), 1-2 clean outcome sentences,
      zero conversational audit jargon ("the user pointed out...", "checked git log..."), first-class
      credit for negative decisions (`decision`), matching developer's primary language.
- [x] Integrate Google Antigravity / Gemini CLI (`agy`) as full Summarizer Provider (`1d40a7a`):
      Added `agy` across permissions, model catalog discovery (14 models detected locally),
      readiness probe (`gemini-3.8-flash-low`), summary runner with JSON envelope parsing,
      and server APIs. 7 unit test suites updated; all 279 tests pass. Real 2026-09-09
      Gemini 3.8 Flash summary saved to `data/reports/`.
- [x] UI Pivot to Zen Daily Journal & Multi-Direction Layout (`04662b0`, `11f01cd`, `b26dcc3`):
      Retired heavy 3D React Flow constellation canvas (reduced bundle size from 414 kB to 233 kB).
      Created `web/ZenJournal.tsx`:
      - 3-way view switcher in header (preserved in `localStorage`):
        1. 📖 Concept A: Minimal Journal (Linear / Raycast)
        2. 🍱 Concept B: Focus Bento (Apple / Things 3)
        3. 📝 Concept C: Executive Briefing (Notion / Axios)
      - Inline expandable evidence drawer fetching traceable session messages on-demand.
      - Inline editing (`PATCH`) and safe two-step deletion (`DELETE`).
      - Date navigation (previous/next day, latest).
      - Full Light Theme support with ☀️/🌙 toggle in header.
- [x] Summarizer Model Selection (with Gemini/agy), Unified Language, & Key Milestone (`isPrimary`):
      - Restored summarizer settings modal in `web/SettingsModal.tsx` with full support for Gemini (`agy`), Claude Code, and Codex.
      - Unified UI and summary generation language into a single setting (`zh-TW` / `en`), backed by `web/i18n.ts` and prompt rule 8.
      - Added `isPrimary?: boolean` to `Achievement` contract, fail-closed validation, and prompt milestone rule.
      - Highlighted key milestone with amber glow, `🌟 Key Milestone` badges across all 3 views, Bento hero card anchoring, and inline edit toggling.
      - 282 unit tests passing, `npm run check` passed.
- [x] Google Antigravity Agent History Collection:
      - Integrated `antigravity` into `LocalSource` and `ReportSource`, reading `~/.gemini/antigravity/brain/**/transcript.jsonl`.
      - Parsed `USER_INPUT`, `PLANNER_RESPONSE` (tool calls), `GENERIC` (tool results), while excluding thinking steps and checkpoints.
      - Added 6 synthetic unit tests in `test/collector/antigravity-parser.test.ts`.
- [x] Date Navigation & Default to Yesterday:
      - Defaulted ZenJournal `selectedDate` to yesterday (`getYesterdayDate()`), with quick navigation (`←`, `Yesterday`, `Today`, `→`, and date input).
      - Added empty date state with one-click on-demand summary generation.
      - Supported Stdin streaming for CLI summarizers (`agy`), eliminating `ARG_MAX` limit for large day payloads.
      - Generated real complete report for 2026-09-18 with `agy` (Gemini 3.8 Flash) covering 5 key achievements.
      - 289 unit tests passing, `npm run check` passed.
- [x] Fix Button Disabled States & In-flight Visual Feedback:
      - Added universal `:disabled` and `:disabled:hover` rules in `web/styles.css` (lowered opacity, `cursor: not-allowed !important`, no shadows/transitions).
      - Replaced interactive hover selectors with `:hover:not(:disabled)` across dark and light themes.
      - Unified `isBusy` lock in `SettingsModal.tsx` covering all async operations (generating, testing, saving provider/language/model/effort).
      - Added `isDeleting` state in `AchievementCard` and disabled header controls during active generation.
      - Passed `npm run check` with all 289 tests passing and production build verified.
- [x] Task 4: port the Local activity / raw collector inspection panel into the Zen interface.
      - Approved design in `docs/plans/2026-09-20-task-4-local-activity-panel-design.md`.
      - Built `web/LocalActivityModal.tsx` and helper `web/local-activity-view.ts` implementing test cases LA-1 through LA-8.
      - Integrated `📂 Local Activity` button in `ZenJournal.tsx` header with unified `isBusy` disabling.
      - Consent scope management for Claude Code, Codex, and Antigravity via `PUT /api/collector/consent`.
      - Source coverage status cards with localized labels, session counts, and issue warnings.
      - Discovered sessions list with expandable on-demand local message preview drawer.
      - 295 unit tests passing; passed `npm run check`.
- [x] Extract Language Switcher from Settings to Header Navigation:
      - Removed language section from `web/SettingsModal.tsx`.
      - Added quick-toggle language button (`🌐 English` / `🌐 繁體中文`) to `web/ZenJournal.tsx` header.
      - Synced language selection with `localStorage` and backend `PUT /api/summarizer/permission`.
      - 295 unit tests passing; passed `npm run check`.
      - *Follow-up Polish*: Stabilize header button layout widths with min-width or icon-primary style to prevent flexbox jitter during language toggling.
- [x] Task L1 (`be95d91`): language packs as plain strings, built-in zh-TW / en / es, searchable
      language dropdown fed by a fixed 41-language catalog (`src/report/languages.ts`).
      - LC-1 to LC-9 approved by Josh; 319 tests pass; `npm run check` passes.
      - The prompt and the permission/generate routes accept only `auto` or a catalog code.
      - Verified in the browser against the real server (search, switch to Spanish, saved
        permission followed and was restored).
- [x] Task L2: generate a language pack on demand for a catalog language that is not built in.
      - Design and test cases L2-1 to L2-25 approved by Josh:
        `docs/plans/2026-09-21-task-l2-on-demand-language-packs-test-cases.md`.
      - Josh chose "prepare first, offer later": a non-built-in language is not selectable and
        shows an `Add` button; it becomes selectable only after a validated pack exists.
      - Building a pack does not require the summarizer permission (only the English UI strings
        are sent, no conversation records); it does use the provider already chosen in settings.
      - 365 tests pass; `npm run check` passes (run in the main session, not only by the subagent).
      - Verified in the browser against the real server: built-ins first, `Add` on every addable
        language, right-to-left languages still shown as not available with no `Add`.
      - Real end-to-end run done with `agy` (Gemini): Add on Japanese produced a validated
        `data/locales/ja.json`, the page switched to Japanese and survived a reload. The failure
        row state is still unit-tested only.
      - Right-to-left layout (`ar`, `he`, `fa`, `ur`) remains its own, still-open decision.
- [x] Task L3: right-to-left layout for `ar` / `he` / `fa` / `ur`, which are now addable like any
      other catalog language.
      - Design and test cases L3-1 to L3-17 approved by Josh:
        `docs/plans/2026-09-21-task-l3-rtl-layout-test-cases.md`.
      - Logical CSS properties throughout, `dir` derived from the language, mirrored day arrows.
      - 380 tests pass; `npm run check` passes. Layout checked in the browser with `dir="rtl"`
        forced by hand.
      - Real end-to-end run done with `agy`: Add on Arabic produced `data/locales/ar.json`, and the
        whole interface switched to mirrored Arabic, checked against the 2026-09-18 report.
- [x] Task L4: cached languages stay added after a reload.
      - Design and test cases L4-1 to L4-8 approved by Josh:
        `docs/plans/2026-09-21-task-l4-cached-languages-stay-added-test-cases.md`.
      - `GET /api/locales` lists the packs on disk; the page fetches it at startup.
      - 395 tests pass; `npm run check` passes. Verified in the browser with the three real
        cached packs, no provider call.
- [ ] End-to-end layer in a real browser, for CSS and layout faults that jsdom cannot see
      (Josh, 2026-09-21: deferred out of Task 5, to be considered on its own). Nothing chosen yet.
- [x] Task 5: component-level tests replace the bundle-string assertions.
      - Design and test cases T5-1 to T5-16 approved by Josh:
        `docs/plans/2026-09-21-task-5-component-tests-test-cases.md`.
      - `@testing-library/react` with `jsdom`, chosen by Josh; jsdom is opted into per file.
      - 410 tests pass; `npm run check` passes. Suite time 2.78s → ~3.9s.

### Phase 6 — Daily automation

- [x] Task S1: schedule exactly one daily report, 07:00 window, launchd job, no re-generation.
      - Decisions: `docs/decisions/2026-09-21-seven-am-report-window.md`. Cases S1-1 to S1-18
        approved by Josh. 434 tests pass; `npm run check` passes.
      - Verified end to end 2026-09-22: generated 2026-09-20 from real records with `agy`, and a
        second run skipped it without calling a provider. Still not installed on Josh's Mac.
- [x] Task S2: `npm run setup` writes `data/report-timezone.json`.
      - Cases S2-1 to S2-10 approved by Josh. 444 tests pass; `npm run check` passes.
      - Run for real: stored `Australia/Sydney`, the machine's own zone, and kept it as the
        report timezone after checking the existing reports and session timestamps.
- [x] Default external summarization permission during setup:
      - `scripts/setup.mjs` calls `setupSummaryPermission` to provision default permission (`zh-TW`, `agy` preferred, fail-closed fallback) per BRIEF.md.
      - Friendly localized guidance in `ZenJournal.tsx` directs user to Settings if permission is missing.
- [x] Mark incomplete reports visibly and provide one-click regeneration:
      - `ZenJournal.tsx` renders localized explanation when report status is `"incomplete"`.
      - Provides an actionable `⚡ 重新產生摘要` button that triggers report regeneration immediately.
- [x] Header controls refinement:
      - Compact utility icon buttons (Local Activity, Settings, Language, Theme) in `web/ZenJournal.tsx`.
      - Centered symmetrical DateStepper (Prev, Date Input, Next) between brand badge and utilities.
- [x] Multi-project attribution & payload balancing:
      - Collector extracts real project names from `cwd`, workspace URIs, and file paths. Resolves temporary Claude scratchpad paths (`/private/tmp/claude-501/.../scratchpad/xreview`) back to enclosing real project (`Josh_JobHunt`) and blacklists generic directory names.
      - `buildReportDayPayload` groups sessions by project and interleaves them round-robin to ensure balanced representation.
      - Ground-truth validation binds `Achievement.project` strictly to the cited manifest record's project.
- [x] Multi-project prompting & evidence sanitization:
      - Generates dynamic `"Conversations by Project"` index in `buildSummaryRequestText` so LLMs have bird's eye visibility across all active projects.
      - Positive date guidance focusing on `HH:mm` for report date accomplishments.
      - Softened empty report constraints to prevent models triggering empty array `{"achievements": []}` escape hatch.
      - Implemented `sanitizeCandidateEvidence` in `summary-run.ts` to defend against hallucinated message IDs or recordId mixups while preserving true source/record grounding.
      - Verified with real end-to-end report generation for 2026-09-21: produced 4 achievements spanning `agent-daily-achievements` and `Josh_JobHunt`.
- [x] `getYesterdayDate()` in `web/date-utils.ts` still assumes a midnight boundary; align the
      page's default date with the 07:00 window.
      - Extracted browser-safe date window logic into `src/report/date-window.ts` (pure TypeScript, zero Node.js built-ins).
      - Re-exported from `src/collector/local-collector.ts` and `src/schedule/report-window.ts` to preserve backwards compatibility.
      - `getYesterdayDate()` now returns the most recently finished window ($D-1$ after 07:00, $D-2$ before 07:00).
      - `getTodayDate()` now returns the active open window ($D$ after 07:00, $D-1$ before 07:00) and clamps `DateSelector` forward stepping.
      - 19 new tests added (W1-1 to W1-15); 625 tests passing.
- [ ] Add a clickable macOS notification.

### Phase 7 — Release readiness

- [x] One-command install: standalone macOS bootstrapper (`install.sh`), downloading managed Node 24 LTS and configuring local execution.
- [x] `scripts/install-launchd.mjs` and `launchd-plist.ts`: detects running/managed Node path instead of hardcoded Homebrew path.
- [ ] Document GitHub-source setup and failure guidance.
- [ ] Verify setup on a fresh macOS user environment.
- [ ] Design the optional Chrome add-on separately.
- [x] Preserve and display all regenerated versions of the same report date;
      keep legacy flat reports readable and edit the selected version only.
      Merged via PR #3 into `master` (`9cbe65d`). `npm run check` passed with
      606 tests on 2026-09-23 before merge.
- [x] Localize the preferred-provider badge and default-model option for the
      built-in languages, with English fallback for existing runtime packs.
- [x] Detect latest provider models (Codex CLI app path & Claude Code versioned labels):
      - Supported discovering `CODEX_CLI_PATH` in `~/.codex/config.toml` and bundled desktop path (`/Applications/ChatGPT.app/Contents/Resources/codex`), discovering `GPT-6-Sol` and `GPT-6-Luna`.
      - Extracted versioned Claude model titles from `model.description` (`Opus 5.5`, `Sonnet 5`, `Fable 5.1`, `Haiku 4.5`).
      - Updated built-in fallbacks; 633 unit and component tests passing.
- [ ] Verify the merged version-history behavior in the live browser on 4317:
      one date must show both its legacy and newly regenerated report, newest
      first; editing one must leave the other unchanged. Josh is currently
      testing this. The API currently reports one legacy version for 9/18.
