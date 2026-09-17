# Readiness probe design

Status: **in progress — decided one item at a time with Josh.** Decision A is
and B are approved; C–E are not decided. No probe code is written and no real probe has
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

## B — Probe model (approved by Josh, 2026-09-17)

- By default, pass no model option: each CLI uses its own default model. The
  probe does not choose the real summarizer's model (blocked item #1).
- The model is adjustable in the local UI per provider. When a model is set,
  the probe passes it (`--model` for Claude Code, `-m` for Codex).
- Limitations recorded: a default-model pass does not prove a different model
  is entitled; a CLI update can change its default silently; Codex ignores the
  user's config (decision A) while Claude Code may take its default from the
  user's settings.
- Safety rule for the UI value: it is passed only as a single argument to
  `spawn` without a shell, and must be validated (for example, no leading `-`,
  a conservative character set, and a length limit) so it cannot inject other
  options. Exact validation is part of the test cases.

Open question: whether a model set in the UI also applies to the real
summarizer run, or only to the probe.

## Not yet decided

- C — when it runs (proposal: only when Josh clicks "Check readiness").
- D — pass criteria (proposal: exit 0 within 60 seconds and exactly
  `{"ok": true}`; the reply is never shown, logged, or saved).
- E — how long Ready lasts (proposal: memory only until restart or re-check).

Test cases are proposed only after A–E are decided.
