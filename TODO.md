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

### Phase 4 — Report intelligence

- [x] Confirm user consent for external summarization separately from local-source consent.
  - The local API stores a fail-closed maximum-permission grant with approved
    source scope, both possible CLI recipients, and an optional CLI preference.
    Eight synthetic Vitest cases cover blocked requests, disclosure, default
    selection, scheduled fallback, both-runner failure, later
    permission/preference changes, server-built payloads, and recipient
    persistence. It does not detect or invoke a real provider yet.
- [ ] Detect available selected Claude Code/Codex CLI and represent failures without silent fallback.
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
    Found three empty leaked probe temporary directories from interrupted
    startup fetches; removed, fix not yet designed.
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
    scored by `src/report/eval-scorer.ts`. No Codex or Claude Code run has used
    this set; prompt iteration has not started.

### Phase 5 — Report control

- [ ] Source trace-back in the report UI.
- [ ] Edit and remove incorrect achievements.
- [ ] Define and enforce local retention.

### Phase 6 — Daily automation

- [ ] Schedule exactly one daily report with idempotent catch-up after sleep/wake.
- [ ] Mark incomplete reports visibly.
- [ ] Add a clickable macOS notification.

### Phase 7 — Release readiness

- [ ] Document GitHub-source setup and failure guidance.
- [ ] Verify setup on a fresh macOS user environment.
- [ ] Design the optional Chrome add-on separately.
