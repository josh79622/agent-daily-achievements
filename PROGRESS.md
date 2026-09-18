# Progress

## Current phase

**Phase 5 — Report control** (not started)

Phase 4 closed as scoped on 2026-09-18 after its
[exit review](docs/reviews/2026-09-18-phase-4-exit-review.md). The tool can
collect consented local Claude Code and Codex records, gate external
summarization behind a separate permission, validate and score model-shaped
reports, and manage provider sign-in, readiness, model, and effort settings.
**No report is generated from real conversations yet;** Phase 5 starts with
that work.

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

**One action is waiting on Josh: say go, and run the Codex eval.**

```bash
npx tsx scripts/experiments/eval-summary.mts codex gpt-5.6-luna
```

Josh approved real model runs against the fictional set only, then asked to
change sessions before the first run. Nothing has been run. The harness sends the
draft prompt plus the eight fictional payloads and nothing else; tools are
disabled, the sandbox is read-only, no session is persisted, and the temporary
directory is removed. Codex spends ChatGPT Plus quota, leaving the Claude quota
this project's sessions consume untouched.

Planned order:

1. Codex `gpt-5.6-luna` (cheapest), 8 cases.
2. Claude Code `haiku`, 8 cases, reading the usage card before and after, which
   converts the estimated 1-15% cost share into a measured number.
3. Only if the cheap models fail: Josh's selected `opus` and `gpt-5.6-terra`.

What this settles at once: whether a cheap model can do this job (Josh's
proposal), whether it cites evidence IDs accurately (inaccurate IDs fail closed
and burn re-analysis attempts, so a cheap model can end up costing more), and
the first real usage figure.

### Phase 5 progress

Complete and verified, all with synthetic records and no CLI invoked:

- Task NT, collector non-text placeholders (`2a652d5`).
- Task PB, server-side payload builder and evidence manifest (`3eda570`).
- Route wiring: `/api/reports/generate` defaults to `buildReportDayPayload`
  (`e237413`).
- Tool capping: `tool_use` capped (`bb20a83`), cap tightened to 250 (`77c4168`),
  then marker plus one per-kind window (`0915242`).
- Draft prompt and fictional eval payloads (`954b827`).

### Decisions parked, waiting on Josh

1. **What the UI shows.** Josh asked to connect the UI to a real report before
   the summarizer, then the cost discussion took over. With no summarizer, a real
   report has `achievements: []`. Options: assemble from the approved fictional
   set so the node shape is visible, or from real collection and show the empty
   and incomplete states. Note the constellation in `web/app.ts` is currently a
   hardcoded `const nodes` array and the page fetches no report at all; the older
   `DailyReport` type is served at `/api/reports/sample` but never rendered.
2. **Conversation order in the payload** follows the approved source scope rather
   than the clock, so a later Codex session can precede an earlier Claude Code
   one. Chronological order would read as one day.
3. **Eval cases 04 and 06** cannot show a two-sided exchange, because each
   approved manifest allows one message per record. Case 04's model confirmation
   is absent and case 06's CI output is pasted inside Josh's own message. Adding
   message IDs to the approved fixture is Josh's decision. Left as-is for now.

### Still not true

No CLI has been invoked, nothing has run against a real day, no report has ever
been generated, and `AchievementReportV1` is not used anywhere in the running app.

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

Open decisions for the remaining report-generation items (none approved yet):

- splitting a day that exceeds model input limits without omission (deferred to
  the summary-run task, to be decided on a measured `byteLength`);
- whether and how secrets inside conversations are masked before sending;
- the exact non-interactive summary command per CLI (the probe commands in
  `docs/plans/2026-09-17-readiness-probe-design.md` are liveness-only), output
  handling, and how the re-analysis decision and fallback are wired;
- where generated reports are stored and how the existing sample report UI is
  replaced;
- the prompt, its synthetic-set evaluation, and which real day Josh approves.

## Latest verification

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

- Checkout: work in `/Users/joshtsai/Documents/agent-daily-achievements` on
  branch `master`. On 2026-09-18 `master` was fast-forwarded to the former
  `codex/ui-skeleton` tip (`f673a67`, 164 commits, no divergence) and the
  `.worktrees/ui-skeleton` worktree was removed, so a new session opens on the
  current work instead of the stale project-setup state. No remote and no PR.
- Runtime: always put `/opt/homebrew/opt/node@24/bin` first on `PATH`; the
  shell's default Node 25 is broken. Gate: `npm run check` (237 tests at
  handoff).
- Dev server: Josh starts it with `npm run dev` from the checkout
  (`http://127.0.0.1:4317/`). On startup it sweeps stale probe temp
  directories and fetches model lists (Codex `codex debug models`, Claude Code
  initialize-only request; no prompt). Local settings live in ignored `data/`
  files, including `data/summarizer-models.json`.
- Key documents for Phase 5: [payload and manifest design](docs/plans/2026-09-18-report-day-payload-design.md),
  [tool truncation decision](docs/decisions/2026-09-18-tool-result-truncation.md),
  [fictional eval payloads](docs/evals/synthetic-set-02-payloads.md),
  prompt draft in `src/report/summary-prompt.ts`, eval harness in
  `scripts/experiments/eval-summary.mts`.
- Earlier key documents: [report contract design](docs/plans/2026-09-17-report-contract-design.md),
  [synthetic set 02](docs/evals/synthetic-set-02.md),
  [readiness probe, model, effort, and leak-fix design](docs/plans/2026-09-17-readiness-probe-design.md),
  [Phase 4 exit review](docs/reviews/2026-09-18-phase-4-exit-review.md),
  [roadmap amendment](docs/decisions/2026-09-16-revised-phase-roadmap.md).
- Working agreement with Josh (from this session):
  - follow AGENTS.md and the AI-assisted development process linked from
    BRIEF.md;
  - bring decisions one at a time with options and a recommendation; do not
    bundle several decisions into one question;
  - propose test cases with fixed IDs and wait for approval before test code;
    run RED, then GREEN, then `npm run check`; mutation-check important tests;
    commit each meaningful part; record only verified status;
  - ask before any real CLI or model run, and state exactly what it sends;
    never read or transmit conversation history; metadata-only checks need
    approval;
  - reply to Josh in both English and Traditional Chinese.
