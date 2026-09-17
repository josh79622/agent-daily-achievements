# Readiness probe design

Status: **in progress — decided one item at a time with Josh.** Decision A is
B, C, D, and E are approved (A amended by D). Test cases below await
confirmation; no probe code is written and no real probe has run. No probe code is written and no real probe has
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
- D4: failure reasons are fixed codes per attempt (`timed out`,
  `exited with error`, `empty reply`, `could not start`), with no reply or
  error text.

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

## Test cases for Task P1 (IDs fixed; awaiting confirmation)

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
| PR-7 | An attempt passes only with exit code 0 and a non-empty reply from the reply channel (Codex `-o` file; Claude Code JSON reply field). Non-zero exit is `exited with error`; a missing, unparseable, whitespace-only, or over-64 KB reply is `empty reply`. |
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
