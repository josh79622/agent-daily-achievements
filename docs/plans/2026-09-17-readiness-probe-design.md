# Readiness probe design

Status: **in progress — decided one item at a time with Josh.** Decision A is
B, C, D, and E are approved (A amended by D). The Task P1/P2 split and test
cases PR-1 to PR-17 were approved on 2026-09-17. Task P1 is implemented and
passes PR-1 to PR-17 with fakes only. Josh's first real checks on 2026-09-17
showed Ready for both Codex and Claude Code; see "Real-run findings". No probe code is written and no real probe has
run.

## Task framing

- Now: a signed-in provider can only show "Not ready", so the Phase 4 item
  "detect usable CLI" cannot be completed.
- When done: a provider shows Ready only after a fixed, fictional,
  zero-conversation prompt succeeds through the same restricted configuration
  the real summarizer will use.

## A — Probe command (approved by Josh, 2026-09-17)

Both commands run from a new empty temporary directory, persist no session,
and receive only a fixed fictional prompt. **Amended by decision D:** no JSON
schema option is passed, because the probe checks liveness, not format
compliance. Option names come from the installed CLIs' `--help` output
(Codex CLI 0.154.0, Claude Code 2.1.226); neither command has been run yet.

Claude Code:

```text
claude -p --tools "" --no-session-persistence --strict-mcp-config \
  --output-format json [--model <model>] "<fixed prompt>"
```

- `--tools ""` disables all built-in tools per `--help`.
- `--bare` is deliberately excluded: its help says it skips keychain reads,
  which would likely break subscription sign-in.

Codex (option A2, chosen over A1):

```text
codex exec --ephemeral --skip-git-repo-check --ignore-user-config \
  --sandbox read-only --color never \
  -o <reply file in the temporary directory> [-m <model>] \
  -C <empty temporary directory> \
  --disable shell_tool --disable unified_exec --disable browser_use \
  --disable computer_use --disable apps --disable plugins \
  --disable image_generation --disable view_image \
  "<fixed prompt>"
```

- Codex has no single "no tools" option. The disabled names come from
  `codex features list`; some may not be tools, and whether this removes every
  tool is **unverified** until a first real run, which happens only when Josh
  clicks the control.
- A1 (read-only sandbox without disabling features) was rejected: read-only
  prevents changes but not reading local files into a reply sent externally.

Reason (Josh agreed): the probe and the future summarizer only turn text into a
small JSON reply and need no tools. Conversations can contain text that acts as
instructions; an unattended run has no one watching tool calls; fewer tools
make readiness more reliable. The probe therefore uses the same tool-restricted
configuration intended for the real summarizer, so Ready reflects that
configuration. The real summarizer's full invocation is still decided under
blocked item #2.

## B — Probe and summary models (approved by Josh, 2026-09-17)

Real summary model:

- By default, pass no model option: each CLI uses its own default model.
- Adjustable per provider in the local UI; when set, the summary run passes it
  (`--model` for Claude Code, `-m` for Codex). This does not choose a default
  model for everyone; blocked item #1 still covers comparing models.

Probe order:

1. Run the probe with the lowest-cost model: Claude Code alias `haiku`
   ("smallest/cheapest" per Claude Code model-config docs; an alias follows the
   latest Haiku) and Codex `gpt-5.6-luna` ("fast and affordable ... lowest cost
   in the family" per Codex models docs, read 2026-09-17).
2. Only if that fails, run the probe once more with the summary model (the UI
   value, or no model option for the default).
3. Ready if either attempt passes; Not ready if both fail.

Defaults for edge cases (not separately confirmed):

- If the summary model is the same as the lowest-cost model, the probe runs
  once.
- Any failure of the first attempt triggers the second, because output is not
  read and failure causes cannot be told apart safely. Worst-case duration is
  two probe time limits (see D).

Recorded consequences:

- Ready means the CLI, sign-in, quota, runtime, and network worked with at
  least one of the two models. It does not guarantee the summary model when
  only the lowest-cost attempt ran; a failed summary run still makes the report
  incomplete (RA-3), with fallback under saved permission.
- `gpt-5.6-luna` is a fixed ID and must be updated when retired; the second
  attempt reduces false Not ready results in that case. Plan entitlement for
  each model is unverified.
- Decision A's "same configuration as the real summarizer" applies to tool
  restrictions, not to the probe's first-attempt model.

Safety rule for the UI model value: it is passed only as a single argument to
`spawn` without a shell and is validated (for example, no leading `-`, a
conservative character set, and a length limit) so it cannot inject other
options. Exact validation is part of the test cases.

## C — When the probe runs (approved by Josh, 2026-09-17)

Option C1: the probe runs only when Josh clicks "Check readiness".

- Each provider has its own "Check readiness" control, so the user chooses
  whose quota is used.
- The control is available only for a signed-in provider; a not-installed or
  signed-out provider never runs a probe.
- While a check is running the control is disabled and the panel shows a
  checking state; a second concurrent probe for the same provider is not
  started.
- "Check again" stays separate: it only re-reads sign-in status, calls no
  model, and uses no quota.
- Rejected: running on page or panel open (C2), automatically after sign-in
  (C3), and periodic background checks (C5), because each spends quota or
  sends requests without a deliberate action. Running before each daily report
  (C4) is deferred to Phase 6 scheduling design.

## D — Probe purpose and pass rule (approved by Josh, 2026-09-17)

Option X: the probe is a **liveness check**, not a format-compliance check.

- Question answered: can the CLI start, is it signed in, is there quota, does
  the runtime and network work, and does a model respond?
- An attempt passes when it finishes within the time limit, exits with code 0,
  and a non-empty reply arrives through the reply channel (Codex: the `-o`
  reply file; Claude Code: the reply field of `--output-format json`). Reply
  content is not otherwise checked, and text is never searched for words such
  as "ok".
- Decision A is amended: `--output-schema` and `--json-schema` are removed.
  Forcing a format would add a failure unrelated to liveness.
- Rejected option Y (summary model only, exact `{"ok": true}` match): costlier
  per check, would change B, and a tiny schema is weak evidence that a model
  can produce a valid report.
- Format compliance is established elsewhere: the eval set run before choosing
  a model (blocked item #1, scored by `src/report/eval-scorer.ts`), and the
  strict report validator on every real run (`src/report/contract.ts`).
- Unverified: which exit codes each CLI returns for rate limits or expired
  sign-in, the exact Claude Code reply field, and the exact `-o` file contents.
  Parsing fails closed until confirmed after the first real run.

D details (approved by Josh, 2026-09-17):

- D1: time limit 60 seconds per attempt; stop, then force-kill on timeout.
- D3: read only the reply channel, in memory, capped at 64 KB; never show,
  log, or save it; delete the temporary directory afterwards.
- D4: failure reasons are fixed codes per attempt, with no reply or error
  text. Amended by Josh on 2026-09-17 (option R3) to six codes:
  - `could not start` — the process could not be spawned;
  - `timed out` — still running at the time limit;
  - `exited with error` — non-zero exit code;
  - `empty reply` — no reply, whitespace only, or no reply field;
  - `unreadable reply` — the reply channel could not be parsed;
  - `reply too large` — the reply exceeded 64 KB.

  The codes are kept specific at the source so later CLI runs (for example the
  summary run) can reuse them; the UI may group them for display. A code is
  added only when the condition can be detected without reading reply or error
  text; for example, rate limit and expired sign-in are not distinguished.

## E — How long Ready lasts (approved by Josh, 2026-09-17)

Option E1:

- Ready and its check time are kept in server memory only; nothing is written
  to disk. A server restart clears them.
- The next "Check readiness" result replaces the previous one.
- If a later status read shows the provider is no longer signed in (signed
  out or not installed), Ready is cleared immediately.
- The panel shows the check time, for example "Ready (checked 14:32)".
- Ready is only a panel indicator; a real summary run still validates its own
  result and marks the report incomplete on failure.
- Rejected: saving Ready to a local file (E2), because it can go stale while
  sign-in or quota changes; automatic expiry (E3), because it needs an
  arbitrary duration and can confuse.

## Proposed task split

- Task P1 — probe runner, readiness state, endpoint, and panel control, using
  the summary model "default" (no model option) for the second attempt.
- Task P2 — per-provider summary model setting in the UI (decision B), which
  the probe's second attempt and later summary runs use. Where the setting is
  saved is not yet decided and will be proposed before P2.

## Task P2 decisions (one at a time)

- S — storage (approved by Josh, 2026-09-17, option S2): the per-provider
  summary model is saved in a new ignored local file
  `data/summarizer-models.json`, using the same atomic-write pattern as the
  other local settings. It holds only provider-to-model values (no entry means
  the CLI default) and no conversation or account data. Rejected: adding it to
  the external-summarization permission file (S1), because that file records
  consent and would need a format change; memory only (S3), because unattended
  summaries would silently revert to the default after a restart.
- I — input style (revised by Josh, 2026-09-17, option I2): a per-provider
  dropdown with "Default" plus a fixed list of known models only; no free-text
  entry. Josh will update the list periodically after release. Initial lists,
  read from the official docs on 2026-09-17 — Claude Code: `haiku`, `sonnet`,
  `opus`, `fable`, `best`, `opusplan`, `sonnet[1m]`, `opus[1m]`; Codex:
  `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`,
  `gpt-5.3-codex-spark`. Rejected: I3 (dropdown plus "Other…", previously
  chosen), because Josh does not want users to enter arbitrary values; I1
  (free text only). Known risks: the list goes stale until updated, and the
  probe tries the lowest-cost model first, so an unavailable summary model can
  still show Ready.
- Effort (Josh, 2026-09-17): a per-provider effort setting is split into a
  separate Task P3 after P2. Evidence so far: `claude --help` lists `--effort`
  with `low`, `medium`, `high`, `xhigh`, `max`; Codex has no `--effort` flag,
  and the setting name `model_reasoning_effort` was found in the user's local
  Codex config (name only, value not read), so `-c model_reasoning_effort=...`
  is the likely route. Codex's allowed values and per-model support are
  unverified.

- M — model list source (approved by Josh, 2026-09-17, option M2; refines
  I2): at server startup, fetch the Codex list with `codex debug models`
  (keeping only `visibility: list`) and the Claude Code list with an
  initialize-only stream-json request (no prompt). Keep only model value,
  display name, and effort levels; always discard everything else, including
  `account`, built-in instructions, and hidden models. If a fetch fails or its
  format is unexpected, use the built-in list Josh maintains and show a note in
  the panel. Users still pick only from a dropdown; no free text.
- V — validation (approved with M2): the server accepts only "Default" or a
  value exactly in that provider's current list, checked when saving and when
  reading the settings file. The regex-only rule V1 was not adopted.
- F — problem settings (approved by Josh, 2026-09-17, option F3): if a saved
  model is no longer available or the settings file is unreadable or invalid,
  use the CLI default and show a warning in the panel. Known consequence
  (stated before the choice): unattended summaries can change model without
  anyone seeing the panel. Rejected: stopping that provider until a new choice
  (F1) and silent fallback without a warning (F2).
- Edge-case defaults (not separately confirmed): "no longer available" is judged
  only against a successfully fetched list; while the built-in fallback list is
  in use, a saved model that passes a basic safety check (first character a
  letter or digit, only letters, digits, `.`, `_`, `-`, `[`, `]`, at most 64
  characters) is still used, with a "model list unavailable" note. The
  catalog's own `default` entry is not offered separately, because "Default"
  already means passing no model option.

## Test cases for Task P2 (IDs fixed; confirmed by Josh with the edge-case defaults, 2026-09-17)

Status: Task P2 is implemented and passes MC-1 to SP-1 with fakes. On
2026-09-17 the real startup fetch returned both lists without a fallback note,
matching the research observations, and a dropdown selection was saved.

Model catalog — `test/summarizer/model-catalog.test.ts`, fake spawner only:

| ID | Intended behavior |
| --- | --- |
| MC-1 | Codex list comes from `codex debug models` spawned without a shell, time limit, and output cap; only `visibility: list` entries are kept, mapped to value (`slug`), label, and effort levels. |
| MC-2 | Claude Code list comes from `claude -p --input-format stream-json --output-format stream-json --verbose --tools "" --no-session-persistence --strict-mcp-config` in a temporary directory; only one `initialize` control request is written and never a user message; the process is stopped after the response; entries map to value, label, and effort levels, and the catalog `default` entry is dropped. |
| MC-3 | Spawn error, timeout, non-zero exit, unparseable output, a missing or empty models array, or no usable entries fall back to the built-in list with source `built-in`. |
| MC-4 | Entries whose value fails the safety check are dropped. |
| MC-5 | No other catalog fields (for example `account`, instructions, hidden models) appear in the catalog result. |

Settings — `test/storage/summarizer-models.test.ts`:

| ID | Intended behavior |
| --- | --- |
| SM-1 | An absent `summarizer-models.json` means Default for both providers. |
| SM-2 | Saving writes the file atomically with owner-only permissions, and reading it back returns the saved choices. |
| SM-3 | An unreadable or invalid file means Default for both providers plus a `settings-unreadable` warning; saving a valid choice replaces it. |

Effective model — same settings test file:

| ID | Intended behavior |
| --- | --- |
| SR-1 | A saved model present in a fetched list is used. |
| SR-2 | A saved model absent from a fetched list uses Default with a `saved-model-unavailable` warning (F3). |
| SR-3 | With the built-in fallback list, a saved model passing the safety check is used with a `model-list-unavailable` note; one failing it uses Default with a warning. |
| SR-4 | The readiness probe's second attempt receives the effective model (none for Default). |

Endpoints — `test/server/summarizer-models.test.ts`:

| ID | Intended behavior |
| --- | --- |
| SE-1 | `GET /api/summarizer/models` (local origin only) returns, per provider, the options, list source, saved choice, effective model, and warning codes, and nothing else. |
| SE-2 | `PUT /api/summarizer/models/:provider` accepts only a local-origin JSON body with exactly `model`, whose value is `default` or in that provider's current list; anything else is 400, 403, or 404 and is not saved. |

Panel — `test/web/build-output.test.ts`:

| ID | Intended behavior |
| --- | --- |
| SP-1 | Each provider has a model dropdown with Default and the listed options, no text input, saves only through the model endpoint, and shows the warning and note texts. |

No test runs a real CLI.

### Dynamic model list research (2026-09-17, approved runs)

- Codex: `codex debug models` ("Render the raw model catalog as JSON") was run
  three times (Josh approved one; two extra runs only re-checked exit code and
  timing): exit 0, about 0.09 seconds, a `models` array of 7 entries with
  `slug`, `display_name`, `visibility` (`list` or `hide`), and
  `supported_reasoning_levels` (for example `low` to `ultra`), plus large
  built-in instructions that must be discarded. It differed from the docs page
  (included `gpt-5.5`, omitted `gpt-5.3-codex-spark`). It is a debug command,
  so its format is not a stable contract.
- Claude Code: no `models` subcommand; the Anthropic `GET /v1/models` API
  requires an API key (not approved). The Claude Agent SDK exposes a
  `ModelInfo` type (value, resolved model, display name, supported effort
  levels). One approved run started the local `claude` in stream-json mode with
  no tools and no session persistence, sent only an `initialize` control
  request and no prompt: the only message was a successful control response
  whose `models` array had 5 entries (`default` resolving to
  `claude-sonnet-5`, `sonnet`, `claude-fable-5[1m]`, `opus`, `haiku`), with
  effort levels for all but `haiku`. The response also contained an `account`
  field, which was not printed and must always be discarded. This protocol is
  undocumented and may change; whether `initialize` uses quota is unverified
  (no model output was observed).

## Task P3 decisions (one at a time)

- R — effort values and route (approved by Josh, 2026-09-18, option R1): the
  effort levels offered for a model are that model's levels from the fetched
  model list (decision M2). Claude Code receives `--effort <level>` (listed in
  `claude --help`: `low`, `medium`, `high`, `xhigh`, `max`). Codex receives
  `-c model_reasoning_effort=<level>` (`-c` documented in `codex exec --help`;
  key documented in the Codex configuration reference). Known conflict: the
  Codex reference lists `minimal | low | medium | high | xhigh`, while the real
  catalog lists `low` to `max` and `ultra` depending on the model; whether the
  CLI accepts `max` and `ultra` through `-c` is unverified until a real run.
  Rejected: fixed lists from the docs (R2), which already disagree with the
  real catalog.
- D — effort while the model is Default (approved by Josh, 2026-09-18, option
  D2): use the default model's levels when the fetched list states them.
  Claude Code's initialize list includes a `default` entry (observed resolving
  to `claude-sonnet-5` with `low` to `max`), so its levels are offered. Codex's
  catalog does not mark a default model, and Codex ignores user config in these
  commands, so only Default effort is offered for Codex while its model is
  Default. Rejected: Default effort only for both (D1) and all levels (D3,
  which can select an unsupported level).
- G — unsupported saved effort (approved by Josh, 2026-09-18, option G2):
  when the user changes a provider's model through the local page, the server
  keeps that provider's saved effort if the new model supports it and
  otherwise resets it to Default in the same save. When the model list changes
  so that a saved effort is no longer supported, the run uses Default effort
  and the panel shows a warning (same pattern as F3). Rejected: always warning
  even after the user's own model change (G1), and blocking the model change
  (G3).
- E — probe effort (approved by Josh, 2026-09-18, option E1): the probe's
  first attempt (lowest-cost model) passes no effort option, keeping the
  command verified on a real run; the second attempt passes the effective
  summary effort, mirroring the summary model. Known limitation: an invalid
  effort is only exercised when the first attempt fails. Rejected: lowest
  effort on the first attempt (E2) and no effort at all (E3).
- Edge-case defaults (not separately confirmed): as with models, "no longer
  supported" is judged only against a fetched list, and a safe saved effort is
  kept while the built-in list is in use; if the summary model equals the
  lowest-cost model but a summary effort is set, the second attempt still runs
  because its configuration differs; the settings file moves to version 2 with
  an `efforts` map, and version 1 files remain readable.

## Temporary directory leak fix (approved by Josh, 2026-09-18)

Probe and model-list temporary directories are removed only after a run ends
normally, so a server stopped mid-run leaves an empty directory. Approved fix
(L3 + L1):

- L3 — clean up on shutdown: track directories in use; on SIGINT or SIGTERM,
  remove them synchronously, then exit.
- L1 — sweep at startup, before the model-list fetch: remove directories in
  the system temporary directory whose names start with
  `daily-achievements-probe-`, that are real directories (never symbolic
  links) owned by the current user, and that were last modified more than 10
  minutes ago. A probe takes at most about 2 minutes and a model-list fetch at
  most 15 seconds, so a concurrent server's directories in use are not removed.
- Rejected: a per-process parent directory (L2), which still needs a sweep
  after a hard kill and adds complexity.

| ID | File | Intended behavior |
| --- | --- | --- |
| LK-1 | `test/summarizer/temp-dirs.test.ts` | The sweep removes only prefixed real directories older than 10 minutes; fresh prefixed directories, other names, symbolic links, and plain files remain. |
| LK-2 | same | On a stop signal, tracked directories are removed and the process still exits. |
| LK-3 | same | A directory removed normally is no longer tracked. |

## Test cases for attempt display (confirmed by Josh, 2026-09-18)

Status: implemented in `4fb350e`; PR-18 and PR-19 pass with fakes and
`npm run check` passed (203 tests). The real panel text has not been observed.

| ID | File | Intended behavior |
| --- | --- | --- |
| PR-18 | `test/summarizer/readiness-probe.test.ts`, `test/server/provider-login.test.ts` | A passing probe reports which attempt passed (`lowest-cost-model` or `summary-model`); the service holds it with Ready in memory, and the status endpoint returns it as a whitelisted field. |
| PR-19 | `test/web/build-output.test.ts` | The panel shows "Ready via lowest-cost model (checked HH:MM)" or "Ready via summary model (checked HH:MM)". |

## Test cases for Task P3 (IDs fixed; confirmed by Josh with the edge-case defaults, 2026-09-18)

Status: Task P3 is implemented and passes EC-1 to EU-1 with fakes only. No real
CLI has received an effort option yet.

| ID | File | Intended behavior |
| --- | --- | --- |
| EC-1 | `test/summarizer/model-catalog.test.ts` | Claude Code's fetched list keeps the `default` entry's effort levels as the default-model levels (the entry is still not offered as a model); Codex has no default-model levels; the built-in fallback has Claude Code `low` to `max` and Codex none. |
| ES-1 | `test/storage/summarizer-models.test.ts` | The settings file stores per-provider efforts (version 2); version 1 files still read with no efforts; an effort that is not a short lowercase word makes the file unreadable. |
| ER-1 | same | Effort options are the effective model's levels; with the Default model they are the default-model levels (Claude Code) or none (Codex) (D2). |
| ER-2 | same | A saved effort supported by the effective model is used; one not supported per a fetched list uses Default effort with a `saved-effort-unavailable` warning (G2). |
| ER-3 | same | With the built-in list, a safe saved effort is kept with the existing `model-list-unavailable` note. |
| ER-4 | same | Saving a model keeps the saved effort if the new model supports it and resets it to Default otherwise, in the same save (G2). |
| EE-1 | `test/server/summarizer-models.test.ts` | `PUT /api/summarizer/models/:provider` accepts exactly one of `model` or `effort`; an effort must be `default` or in the current effort options; anything else is 400 and not saved. |
| EE-2 | same | `GET /api/summarizer/models` also returns effort options, the selected effort, and the effective effort. |
| EP-1 | `test/summarizer/readiness-probe.test.ts` | The first attempt never passes an effort; the second attempt passes `--effort <level>` (Claude Code) or `-c model_reasoning_effort="<level>"` (Codex) when an effective effort exists, and nothing for Default. |
| EP-2 | same | If the summary model equals the lowest-cost model but an effort is set, the second attempt still runs. |
| EU-1 | `test/web/build-output.test.ts` | Each provider has an effort dropdown with Default and the current options, disabled when there are none, saved only through the model endpoint, with a fixed warning text for an unsupported saved effort. |

No test runs a real CLI.

## Test cases for Task P1 (IDs fixed; confirmed)

Probe runner — `test/summarizer/readiness-probe.test.ts`, fake spawner, fake
clock, and fake temporary directories only:

| ID | Intended behavior |
| --- | --- |
| PR-1 | Claude Code attempt spawns `claude` without a shell, cwd a new empty temporary directory, with exactly `-p --tools "" --no-session-persistence --strict-mcp-config --output-format json`, the model option when given, and the fixed prompt; never `--bare`, `--json-schema`, or a permission-bypass option. |
| PR-2 | Codex attempt spawns `codex exec` without a shell with exactly `--ephemeral --skip-git-repo-check --ignore-user-config --sandbox read-only --color never -o <file in the temporary directory> -C <temporary directory>`, the eight `--disable` features, the model option when given, and the fixed prompt; never `--output-schema` or a bypass option. |
| PR-3 | The first attempt uses `haiku` (Claude Code) or `gpt-5.6-luna` (Codex); if it passes, the result is Ready and no second attempt runs. |
| PR-4 | If the first attempt fails, a second attempt runs with the summary model (no model option for the default); if it passes, the result is Ready. |
| PR-5 | If both attempts fail, the result is Not ready with one fixed reason code per attempt. |
| PR-6 | If the summary model equals the lowest-cost model, only one attempt runs. |
| PR-7 | An attempt passes only with exit code 0 and a non-empty reply from the reply channel (Codex `-o` file; Claude Code JSON reply field). Non-zero exit is `exited with error`; a missing, whitespace-only, or absent reply field is `empty reply`; an unparseable reply channel is `unreadable reply`; a reply over 64 KB is `reply too large`. |
| PR-8 | An attempt still running at 60 seconds is stopped, force-killed if it does not exit, and reported as `timed out`. |
| PR-9 | A spawn error is `could not start`. |
| PR-10 | Reply text, stderr, and environment values never appear in any result, and the temporary directory is removed after pass, failure, timeout, and spawn error. |

Readiness state — same file:

| ID | Intended behavior |
| --- | --- |
| PR-11 | A probe starts only for a signed-in provider; a not-installed or sign-in-required provider is rejected without spawning. |
| PR-12 | A second request for a provider whose probe is running does not start another probe and reports the checking state. |
| PR-13 | Ready is held in memory with its check time and replaced by the next result; a new service instance (restart) starts without Ready. |
| PR-14 | A later status read showing the provider not signed in clears Ready. |
| PR-15 | While Ready is held and the provider is still signed in, the provider state is `ready`; otherwise signed-in providers keep the existing not-ready state. |

Endpoint — `test/server/provider-login.test.ts`:

| ID | Intended behavior |
| --- | --- |
| PR-16 | `POST /api/summarizer/providers/:provider/readiness` accepts only a local-origin request with no body and a known provider (otherwise 403, 400, or 404, and no probe); it returns only safe fields and never reply text. |

Panel — `test/web/build-output.test.ts`:

| ID | Intended behavior |
| --- | --- |
| PR-17 | Each provider has a "Check readiness" control that the page enables only for a signed-in provider and not while checking; the page calls only the readiness endpoint and shows "Ready (checked HH:MM)" or the fixed failure reasons. |

No test runs a real CLI. The first real probe happens only when Josh clicks the
control.

## Real-run findings (2026-09-17)

- Verified: both installed CLIs accepted the approved commands, including
  `--tools ""` for Claude Code and the eight `--disable` switches, `-o`, and
  `--ephemeral` for Codex; each produced a non-empty reply through its reply
  channel; no `daily-achievements-probe-*` temporary directory remained.
- Not verified at that point: which attempt passed (lowest-cost or summary
  model), whether the Codex switches remove every tool, real exit codes for
  failure cases such as rate limits or expired sign-in, and that no session
  was persisted.

## Follow-up verification (2026-09-18)

- Network failure (Josh turned Wi-Fi off and clicked Check readiness for both
  providers): both attempts reported `timed out` for Codex and Claude Code;
  no false Ready.
- Session persistence (Josh approved; metadata only, no file opened): file
  paths, sizes, and modification times under `~/.codex/sessions`,
  `~/.codex/archived_sessions`, and `~/.claude/projects` were recorded before
  and after one real Check readiness per provider (both showed Ready). No new
  file appeared in any of them, and none named after the probe temporary
  directories; one existing Claude Code file changed, most likely this working
  session's own transcript. The startup model-list fetch was not covered.
- Local checks without a model call (Josh approved):
  - `codex debug prompt-input` renders only messages (developer instructions
    and user input), not tool definitions, so it cannot show which tools remain
    after the eight `--disable` switches. With the switches the rendered input
    shrank from about 29.5 KB to 20.7 KB, which suggests related instructions
    are removed but does not prove tool removal. (A first combined run exited 2
    because of a shell quoting mistake in the check script; each switch and the
    correctly quoted combination exit 0.)
  - `codex debug prompt-input -c model_reasoning_effort=...` exited 0 for
    `high`, `ultra`, and a deliberately invalid `bogus`, so it does not
    validate effort values and cannot verify item 4.
- Codex canary run (Josh approved one real run, 2026-09-18): the exact probe
  first-attempt command (`gpt-5.6-luna`, read-only sandbox, eight `--disable`
  switches, empty working directory) was asked to read a fictional random
  token from a file in a different temporary directory. It exited 0 after 13
  seconds and replied `NOACCESS`; the token did not appear. This is evidence
  that file reading outside the working directory was unavailable in this
  configuration; a single run does not prove no other tool remains.
- Leak found: three empty `daily-achievements-probe-*` temporary directories
  from 00:14–00:15 remained, before the current dev server started; the most
  likely cause is the server being stopped or restarted while a startup
  model-list fetch was in flight, so the cleanup step never ran. They held no
  data and were removed. Reproduced at 00:57: an empty directory was created
  one second before the dev watcher restarted the server while code was being
  edited. A fix has not been designed.
- Still unverified: whether Codex accepts `max` or `ultra` effort in a real run
  (Josh limited this item to checks without a model call; recorded as a known
  limitation), quota-exhaustion exit codes, and which probe attempt passed
  (Task PR-18/PR-19 approved).
