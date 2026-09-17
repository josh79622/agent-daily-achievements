# Readiness probe design

Status: **in progress — decided one item at a time with Josh.** Decision A is
B, and C are approved; D–E are not decided. No probe code is written and no real probe has
run.

## Task framing

- Now: a signed-in provider can only show "Not ready", so the Phase 4 item
  "detect usable CLI" cannot be completed.
- When done: a provider shows Ready only after a fixed, fictional,
  zero-conversation prompt succeeds through the same restricted configuration
  the real summarizer will use.

## A — Probe command (approved by Josh, 2026-09-17)

Both commands run from a new empty temporary directory, persist no session,
and receive only a fixed fictional prompt asking for `{"ok": true}` constrained
by a JSON schema. Option names come from the installed CLIs' `--help` output
(Codex CLI 0.154.0, Claude Code 2.1.226); neither command has been run yet.

Claude Code:

```text
claude -p --tools "" --no-session-persistence --strict-mcp-config \
  --output-format json --json-schema <schema> "<fixed prompt>"
```

- `--tools ""` disables all built-in tools per `--help`.
- `--bare` is deliberately excluded: its help says it skips keychain reads,
  which would likely break subscription sign-in.

Codex (option A2, chosen over A1):

```text
codex exec --ephemeral --skip-git-repo-check --ignore-user-config \
  --sandbox read-only --color never --output-schema <schema> \
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

## Not yet decided

- D — pass criteria (proposal: exit 0 within 60 seconds and exactly
  `{"ok": true}`; the reply is never shown, logged, or saved).
- E — how long Ready lasts (proposal: memory only until restart or re-check).

Test cases are proposed only after A–E are decided.
