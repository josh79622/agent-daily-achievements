# UI-first CLI Login Demo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Demonstrate a macOS local-web UI that can initiate Codex or Claude Code's own login flow without the user manually opening Terminal, then safely show provider readiness without reading or transmitting conversation records.

**Architecture:** Keep credentials and authentication inside the provider CLI. The local UI talks only to loopback server endpoints. The server has an injectable provider-status service and a fixed-command macOS launcher: browser input can select only `codex` or `claude-code`, never contribute a shell command. A demo probe must be synthetic and contain no local history, but do not choose a model or real non-interactive probe command until Josh explicitly approves it.

**Tech Stack:** Node.js 24, TypeScript, native `node:child_process`, macOS `osascript`/Terminal, Vitest, existing local HTTP server and static web UI.

---

## User-approved behavior

- Installation must not require either Codex or Claude Code login.
- On a user's first report run, the local UI shows **both** provider login buttons.
- A user signed into Codex may summarize both locally authorized Codex and Claude Code histories, if they separately granted maximum external-summarization permission. Claude Code login remains optional unless selected as the summarizer or fallback.
- For each provider, show exactly one local state: `not-installed`, `sign-in-required`, `login-in-progress`, `ready`, or `probe-failed`.
- A not-installed provider still appears in the UI with a disabled sign-in button and an installation-instructions link.
- Clicking an enabled sign-in button starts only that provider's normal local login command. It must not expose, request, persist, log, or return credentials, tokens, raw terminal output, or conversation text.
- The intended acceptance result is: clicking an available login button starts the provider-supported login flow without manually opening Terminal; after a separately approved zero-conversation probe passes, that provider is `ready`.

## Non-goals and decision gate

- Do not collect local session data, invoke the report summarizer, or transmit conversations in this demo.
- Do not embed a provider login page or iframe.
- Do not choose a provider model, API key path, unattended credential strategy, or production probe command. The project has not approved those details.
- `codex` is currently present but its shell wrapper may use a broken Node 25 runtime; Node 24 is the project runtime. Surface the actual launch/probe failure as `probe-failed`; do not modify Homebrew, credentials, or global shells to conceal it.
- A `login status` check alone is not the previously approved synthetic readiness probe. It may establish `sign-in-required` vs a possible signed-in state, but must not claim `ready` until Josh approves and verifies a zero-conversation probe command.

## Task 1: Define provider status and fixed-command boundaries

**Files:**
- Create: `src/summarizer/provider-login.ts`
- Create: `test/summarizer/provider-login.test.ts`

**Step 1: Write failing unit tests**

Create test cases with a fake command executor for both `"codex"` and `"claude-code"`:

1. A missing executable reports `not-installed`; it does not attempt a login command.
2. An installed CLI whose safe status command says unauthenticated reports `sign-in-required`.
3. An installed, authenticated CLI reports a non-ready intermediate state until a probe succeeds; it must never infer `ready` from presence or login status alone.
4. A probe success reports `ready`; a probe exit/error reports `probe-failed` with a sanitized, non-secret reason.
5. The login launcher accepts only the `SummaryProvider` union. Confirm it maps `codex` and `claude-code` to fixed command arrays and rejects arbitrary strings.
6. Command stderr/stdout, environment values, and supplied prompts never appear in the returned status/reason.

**Step 2: Run the test file RED**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm test -- test/summarizer/provider-login.test.ts
```

Expected: FAIL because `provider-login.ts` does not exist.

**Step 3: Implement the smallest pure service**

- Export `ProviderLoginState`, `ProviderLoginStatus`, and a `ProviderLoginService` interface.
- Inject a `CommandExecutor`; do not call `exec`, `spawn`, or a shell from the pure status mapper.
- Keep provider labels, executable discovery, fixed command arrays, and reason sanitization in this module.
- Define a `probe` dependency but leave its production command unconfigured until Josh approves it. Tests use only fake probe outcomes.

**Step 4: Run the focused test GREEN**

Run the command from Step 2. Expected: all new provider-login tests pass.

**Step 5: Commit**

```bash
git add src/summarizer/provider-login.ts test/summarizer/provider-login.test.ts
git commit -m "feat: model local provider login states"
```

### Task 2: Add local-only login/status endpoints

**Files:**
- Modify: `src/server/app.ts`
- Create: `test/server/provider-login.test.ts`

**Step 1: Write failing server tests**

Using an injected fake `ProviderLoginService`, test:

1. `GET /api/summarizer/providers` returns both providers and only their safe status fields.
2. `POST /api/summarizer/providers/codex/login` starts only Codex login and returns `202` with `login-in-progress`.
3. `POST /api/summarizer/providers/claude-code/login` starts only Claude Code login.
4. Unknown provider IDs, malformed bodies, non-local host/origin, and cross-site requests cannot start login.
5. The endpoint never returns a fake executor's stdout/stderr/token-like strings.
6. No route in this task reads a collector, creates a report request, or calls `SummaryRunner`.

**Step 2: Run the server test RED**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm test -- test/server/provider-login.test.ts
```

Expected: FAIL with missing endpoints.

**Step 3: Implement minimal routes**

- Extend `AppOptions` with an optional injected `providerLoginService`.
- Reuse the existing `localOrigin` checks used by collector and permission settings.
- Permit no request body for the login endpoints. Never accept an executable, arguments, prompt, environment, or callback URL from the client.
- Return `503` with a safe unavailable state when the service is absent.
- Do not alter `/api/reports/generate` or enable the real summarizer in `src/server/index.ts`.

**Step 4: Run the server test GREEN and all current tests**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm test -- test/server/provider-login.test.ts
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm test
```

Expected: focused test and whole test suite pass.

**Step 5: Commit**

```bash
git add src/server/app.ts test/server/provider-login.test.ts
git commit -m "feat: expose local provider login status"
```

### Task 3: Implement the macOS-only launcher behind the service

**Files:**
- Modify: `src/summarizer/provider-login.ts`
- Modify: `src/server/index.ts`
- Modify: `test/summarizer/provider-login.test.ts`

**Step 1: Add failing tests for the launcher adapter**

Test the adapter with a fake process spawner:

1. It launches a known macOS Terminal/AppleScript integration with a fixed provider login command.
2. `codex` maps only to the current discovered Codex executable plus its approved `login` subcommand; Claude Code maps likewise.
3. It rejects untrusted executable/argument text and does not use `shell: true`.
4. A launcher failure changes only the provider state to a sanitized `probe-failed`/launch failure; the process output and environment remain hidden.

**Step 2: Run RED**

Run the Task 1 focused test. Expected: FAIL for the new launcher behavior.

**Step 3: Implement only the macOS adapter**

- Use `child_process.spawn` with argument arrays; never interpolate browser text into a command.
- Start the provider's normal login flow through Terminal so it has an interactive terminal and can open its provider-managed browser auth flow.
- Restrict this adapter to `process.platform === "darwin"`; otherwise report `not-installed`/unavailable rather than pretending support.
- The browser UI must receive a safe “login started; complete it in Terminal, then refresh status” state. Do not attempt to parse terminal output or credentials.

**Step 4: Run GREEN**

Run the Task 1 focused test, then `npm run typecheck`.

**Step 5: Manual demo check (no report data)**

On Josh's Mac only, and only after he clicks a UI button:

1. Confirm a Terminal window opens for the selected provider.
2. Complete or cancel the provider-owned login yourself.
3. Reload status and record only the safe state; do not copy tokens, terminal output, account names, file paths, or conversation data into the repository.

**Step 6: Commit**

```bash
git add src/summarizer/provider-login.ts src/server/index.ts test/summarizer/provider-login.test.ts
git commit -m "feat: launch provider sign-in from local UI"
```

### Task 4: Add the first-run UI panel

**Files:**
- Modify: `web/index.html`
- Modify: `web/app.ts`
- Modify: `web/styles.css`
- Modify: `test/web/build-output.test.ts`

**Step 1: Write failing static/build assertions**

Assert the built page contains:

1. A “Report sign-in” region with both provider labels.
2. A distinct status element for each provider.
3. Both sign-in buttons, plus an installation-instructions link for unavailable providers.
4. No credential fields, API-key fields, token labels, raw command strings, or conversation preview in this panel.

**Step 2: Run RED**

Run:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm test -- test/web/build-output.test.ts
```

Expected: FAIL because the panel is absent.

**Step 3: Implement the UI**

- Add both buttons regardless of status.
- Disable unavailable buttons, keep their install link visible, and use accessible status text (`role="status"`).
- On panel open, fetch provider statuses. On click, POST only to that fixed provider's login endpoint; show the safe in-progress state, then refresh status on an explicit “Check again” action.
- Do not auto-run a probe, collect sources, or generate a report in this demo.
- Use the existing UI style conventions; do not redesign the achievement constellation or collector panel.

**Step 4: Run GREEN**

Run the focused web test and then:

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run check
```

Expected: format, lint, typecheck, all tests, and build pass.

**Step 5: Commit**

```bash
git add web/index.html web/app.ts web/styles.css test/web/build-output.test.ts
git commit -m "feat: show provider sign-in controls"
```

## Completion report required from Claude Code

Report the exact commits, changed files, focused test output, final `npm run check` output, and the manual demo result. State clearly whether the real zero-conversation readiness probe remains intentionally unconfigured. Do not claim that login status alone proves unattended report generation is ready.
