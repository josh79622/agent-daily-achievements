# macOS One-Line Installer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a macOS user install the local daily-achievements tool from one deliberate GitHub bootstrap command, even when no usable Node is installed, without modifying system software.

**Architecture:** A small POSIX-shell bootstrapper owns the no-Node entry point and calls platform adapters for downloads, checksums, filesystem changes, and `launchctl`. It installs a verified private Node 24 runtime, then invokes a TypeScript installer service with explicit paths; that service coordinates source setup, timezone, build, and the existing launchd writer. The running web app owns version/update/removal state and uses staged directories so a failed update never replaces the active release.

**Tech Stack:** POSIX shell, Node.js 24 LTS, TypeScript, Node built-in APIs, Vitest, npm, `launchd`, GitHub fixed-version release archives.

---

## Preconditions and decisions still required

Do not publish a one-line bootstrap command or implement network endpoints until Josh approves all of the following. These are release decisions, not details to guess in code:

- GitHub repository/release URL and the supported macOS version and hardware floor.
- Release archive name, version metadata, where the Node and project SHA-256 values are published, and the verification/signing scheme for that metadata. Do not invent a release-manifest format or claim signed releases before this is decided.
- The documented visible default source-install directory and the exact command syntax for choosing another directory.
- The settings-page location and copy for version checks, manual update, automatic-update consent, update errors, and removal confirmation.
- The delivery location and user-facing command for the bootstrapper after a clean-macOS E2E run has passed.

## Acceptance cases

Use these short Given/When/Then cases to derive tests before implementation. They describe macOS only and do not imply Windows or Linux support.

1. Given an Apple Silicon Mac with no usable Node, when the user runs the approved bootstrap command, then the installer downloads the Node 24 arm64 distribution, verifies its SHA-256, and uses its absolute `node` path.
2. Given an Intel Mac with no usable Node, when the bootstrap runs, then it selects the Node 24 x64 distribution and rejects any other architecture.
3. Given a download whose SHA-256 does not match the approved value, when verification runs, then no runtime or source becomes active and the error says verification failed.
4. Given a prior verified runtime and working app, when any later bootstrap stage fails, then the prior runtime, app, and scheduled job remain usable and the failed stage gives a next action.
5. Given a selected source directory that already contains an installation, when bootstrap runs, then it does not overwrite it and directs the user to update instead.
6. Given a fresh selected directory and a verified release archive, when installation succeeds, then `npm ci`, production build, timezone setup, and one daily 07:00 job complete using the managed runtime.
7. Given the managed runtime has resolved to an absolute path, when the job is installed, then its plist invokes exactly that path rather than a shell `PATH` or developer-specific Homebrew path.
8. Given no supported summarizer CLI is installed, when installation succeeds and the page opens, then the interface says no summarizer is connected and offers the existing connect guidance; it does not report installation failure.
9. Given the user reruns installation after the job already exists for the same new installation, when launchd setup succeeds, then exactly one label is reloaded; it never creates duplicate jobs.
10. Given manual updates are selected, when a newer fixed release is available, then no change occurs until the user explicitly starts an update.
11. Given automatic updates are enabled, when a daily report has finished, then the app checks once for a newer release after—not during—the report.
12. Given a verified staged update whose dependency install and build pass, when activation occurs, then the active release switches atomically and all existing user settings remain unchanged.
13. Given an update fails during fetch, checksum, dependency install, or build, when it finishes, then the old active release and its job stay active and settings records a safe error.
14. Given the user confirms removal, when removal succeeds, then the tool unloads/removes only its own launchd job, app release(s), and managed runtime; reports, settings/data, system Node, and agent CLIs remain.

## Test approach and platform boundary

- Keep selector, path-layout, state-machine, and error-mapping functions pure. Unit-test them directly with Vitest.
- Put shell execution, `curl`, `shasum`, archive extraction, process spawning, filesystem mutation, browser opening, and `launchctl` behind injected adapters. Use fake adapters in unit/integration tests; tests must never download software, change `~/Library`, or load a real job.
- Test the shell bootstrapper with a temporary directory and fake command binaries that record arguments. This verifies command ordering and exit handling without network or system changes.
- A future clean macOS manual E2E—not a mocked test—is required before release: a new user account, no usable Node, both arm64 and x64 hardware/VM coverage where available, valid and invalid checksums, existing-install protection, one loaded 07:00 job, the local page, no-summarizer state, one usable provider state, update recovery, and removal preservation.

### Task 1: Establish installer boundaries and path layout

**Files:**
- Create: `src/installer/layout.ts`
- Create: `src/installer/types.ts`
- Create: `test/installer/layout.test.ts`

**Step 1: Write failing tests**

Cover the managed root under `~/Library/Application Support/Agent Daily Achievements`, versioned runtime/staging/active-release paths, a visible source-install default supplied as configuration, and rejection of relative or escaping paths.

**Step 2: Run the focused test to verify it fails**

Run: `npx vitest run test/installer/layout.test.ts`

Expected: FAIL because the installer layout module does not exist.

**Step 3: Implement the minimal pure layout module**

Represent all user-owned data and tool-managed runtime/application paths separately. Do not choose the still-unapproved public source default in code; accept it as an explicit configuration value.

**Step 4: Run the focused test to verify it passes**

Run: `npx vitest run test/installer/layout.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/installer/layout.ts src/installer/types.ts test/installer/layout.test.ts
git commit -m "feat: define managed installer paths"
```

### Task 2: Select and verify the private Node runtime

**Files:**
- Create: `src/installer/node-runtime.ts`
- Create: `src/installer/system-adapter.ts`
- Create: `test/installer/node-runtime.test.ts`

**Step 1: Write failing tests**

Test `arm64` selects only the approved Node 24 arm64 descriptor, `x86_64` selects x64, unsupported architecture fails before download, and a checksum mismatch leaves no candidate active. Test that a verified extracted runtime returns an absolute `bin/node` path and rejects a missing/non-executable path.

**Step 2: Run the focused test to verify it fails**

Run: `npx vitest run test/installer/node-runtime.test.ts`

Expected: FAIL because runtime selection and verification do not exist.

**Step 3: Implement the minimal runtime selector and adapter contract**

Keep the official Node archive URL and checksum as inputs from approved release metadata. The adapter contract should model architecture lookup, download-to-staging, SHA-256, extraction, rename/atomic activation, and executable checks without shelling out in the domain service.

**Step 4: Run the focused test to verify it passes**

Run: `npx vitest run test/installer/node-runtime.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/installer/node-runtime.ts src/installer/system-adapter.ts test/installer/node-runtime.test.ts
git commit -m "feat: verify managed Node runtime"
```

### Task 3: Orchestrate a recoverable fresh installation

**Files:**
- Create: `src/installer/install.ts`
- Create: `test/installer/install.test.ts`
- Modify: `src/storage/report-timezone.ts`
- Modify: `src/schedule/launchd-install.ts`

**Step 1: Write failing tests**

Use fake adapters to assert the stage order: validate macOS/writable space, stage verified runtime, reject occupied source destination, stage verified source archive, run managed `npm ci`, production build, timezone setup, write/reload one plist, then open the local page. Cover every stage failure retaining a prior active install/job and returning a named actionable failure. Include a fresh install with absent providers that still completes.

**Step 2: Run the focused test to verify it fails**

Run: `npx vitest run test/installer/install.test.ts`

Expected: FAIL because the orchestrator does not exist.

**Step 3: Implement the minimal transaction coordinator**

Refactor only enough existing timezone and launchd file-writing APIs to accept installation paths and injected side effects. Do not let this task invoke real `launchctl`; it receives an adapter. Preserve all current report data on failure.

**Step 4: Run focused installer and scheduling tests**

Run: `npx vitest run test/installer/install.test.ts test/schedule/launchd-install.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/installer/install.ts test/installer/install.test.ts src/storage/report-timezone.ts src/schedule/launchd-install.ts
git commit -m "feat: add recoverable macOS installation flow"
```

### Task 4: Hand the managed absolute Node path to launchd

**Files:**
- Modify: `scripts/install-launchd.mjs`
- Modify: `src/schedule/launchd-plist.ts`
- Modify: `test/schedule/launchd-plist.test.ts`
- Create: `test/installer/launchd-adapter.test.ts`

**Step 1: Write failing tests**

Test the installer-provided managed `/.../node-v24.../bin/node` appears in `ProgramArguments`; test the legacy Homebrew literal is absent. With a fake `launchctl`, assert bootout-before-bootstrap/reload uses exactly the one label and plist path, and that a bootstrap failure reports failure without claiming readiness.

**Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run test/schedule/launchd-plist.test.ts test/installer/launchd-adapter.test.ts`

Expected: FAIL because the script still hard-codes a Homebrew path and has no injectable adapter.

**Step 3: Implement the minimal launchd adapter handoff**

Replace the developer-machine constant with the resolved managed path from installer configuration. Keep plist generation pure and isolate process calls from the script so tests do not touch launchd.

**Step 4: Run focused tests to verify they pass**

Run: `npx vitest run test/schedule/launchd-plist.test.ts test/schedule/launchd-install.test.ts test/installer/launchd-adapter.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/install-launchd.mjs src/schedule/launchd-plist.ts test/schedule/launchd-plist.test.ts test/installer/launchd-adapter.test.ts
git commit -m "fix: schedule reports with managed Node path"
```

### Task 5: Add the no-Node POSIX bootstrapper

**Files:**
- Create: `installer/macos/bootstrap.sh`
- Create: `installer/macos/bootstrap-lib.sh`
- Create: `test/installer/macos-bootstrap.test.ts`
- Modify: `package.json`

**Step 1: Write failing tests**

In temporary directories with fake `uname`, `curl`, SHA-256 tool, archive extractor, and managed `node`, test architecture dispatch, command argument safety, staged cleanup, explicit occupied-source stop, checksum stop, and handoff to the TypeScript installer through the managed absolute node. Verify it never calls `sudo`, Homebrew, or an ambient `node`.

**Step 2: Run the focused test to verify it fails**

Run: `npx vitest run test/installer/macos-bootstrap.test.ts`

Expected: FAIL because the bootstrapper is absent.

**Step 3: Implement the minimal POSIX bootstrapper**

Use `set -eu`, quote all paths, use a temporary staging directory, and emit only safe actionable error text. The script receives approved release metadata/URLs as arguments or a downloaded approved document; it must not hard-code invented public URLs. Add only a local developer script needed to exercise the bootstrapper—not a public command—until the preconditions are decided.

**Step 4: Run the focused test to verify it passes**

Run: `npx vitest run test/installer/macos-bootstrap.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add installer/macos/bootstrap.sh installer/macos/bootstrap-lib.sh test/installer/macos-bootstrap.test.ts package.json
git commit -m "feat: add macOS Node bootstrapper"
```

### Task 6: Surface provider absence as setup, not installer failure

**Files:**
- Modify: `src/server/app.ts`
- Modify: `web/SettingsModal.tsx`
- Modify: `web/locales/en.ts`
- Modify: `web/locales/zh-TW.ts`
- Modify: `web/locales/es.ts`
- Create: `test/server/installer-status.test.ts`
- Create: `test/web/installer-status.test.tsx`

**Step 1: Write failing tests**

Given an installation marked complete and all provider statuses `not-installed`, assert the API returns installation success plus a safe provider-connection state, and the UI says no summarizer is connected with the established provider install/login guidance. Assert it does not expose command output, environment values, or raw errors.

**Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run test/server/installer-status.test.ts test/web/installer-status.test.tsx`

Expected: FAIL because installer state is not surfaced.

**Step 3: Implement the minimal status route and view**

Reuse the existing provider-login service states; do not attempt to install or log into a provider automatically. Keep installation completion separate from report-generation readiness.

**Step 4: Run focused provider-status tests to verify they pass**

Run: `npx vitest run test/server/installer-status.test.ts test/web/installer-status.test.tsx test/summarizer/provider-login.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/app.ts web/SettingsModal.tsx web/locales/en.ts web/locales/zh-TW.ts web/locales/es.ts test/server/installer-status.test.ts test/web/installer-status.test.tsx
git commit -m "feat: show missing summarizer after setup"
```

### Task 7: Define staged, verified manual and automatic updates

**Files:**
- Create: `src/updates/update-service.ts`
- Create: `src/storage/update-settings.ts`
- Create: `test/updates/update-service.test.ts`
- Create: `test/storage/update-settings.test.ts`
- Modify: `src/schedule/run-scheduled-report.ts`
- Modify: `src/server/app.ts`
- Modify: `web/SettingsModal.tsx`
- Modify: `web/locales/en.ts`
- Modify: `web/locales/zh-TW.ts`
- Modify: `web/locales/es.ts`

**Step 1: Write failing tests**

Test manual mode records availability but makes no change without an explicit action. Test automatic mode checks only after a successful/finished scheduled report. Test fixed-version archive checksum verification, stage-then-`npm ci`-then-build-then-atomic activation, and each failure point retaining the old active release/job and storing a redacted error/last-check timestamp. Test that consent, source permissions, timezone, and report data are unchanged.

**Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run test/updates/update-service.test.ts test/storage/update-settings.test.ts`

Expected: FAIL because no update service or settings store exists.

**Step 3: Implement the minimal update service**

Use the same approved metadata input and system adapter boundary as installation. Model active/staged release directories and atomic pointer/symlink replacement behind the adapter. Do not create a release manifest or signed-release claim until the preconditions are approved.

**Step 4: Run focused update and scheduling tests to verify they pass**

Run: `npx vitest run test/updates/update-service.test.ts test/storage/update-settings.test.ts test/schedule/run-scheduled-report.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/updates/update-service.ts src/storage/update-settings.ts test/updates/update-service.test.ts test/storage/update-settings.test.ts src/schedule/run-scheduled-report.ts src/server/app.ts web/SettingsModal.tsx web/locales/en.ts web/locales/zh-TW.ts web/locales/es.ts
git commit -m "feat: add staged installer updates"
```

### Task 8: Implement safe removal and document clean-macOS E2E evidence

**Files:**
- Create: `src/installer/remove.ts`
- Create: `scripts/remove.mjs`
- Create: `test/installer/remove.test.ts`
- Create: `docs/plans/2026-09-22-macos-one-line-installer-e2e-checklist.md`

**Step 1: Write failing tests**

With fake filesystem and launchd adapters, test removal targets only the known tool-managed job/runtime/app paths, leaves reports/settings/data and non-tool paths untouched, treats an absent job as safe, and stops on an ambiguous target before deleting anything.

**Step 2: Run the focused test to verify it fails**

Run: `npx vitest run test/installer/remove.test.ts`

Expected: FAIL because the remover does not exist.

**Step 3: Implement the minimal remove service and command**

Unload the exact label, remove only validated managed paths, and require a separately designed explicit confirmation for data deletion; this task must not delete data. Record manual E2E steps/results in the checklist but do not claim them complete until actually performed on clean macOS.

**Step 4: Run focused tests to verify they pass**

Run: `npx vitest run test/installer/remove.test.ts test/installer/install.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/installer/remove.ts scripts/remove.mjs test/installer/remove.test.ts docs/plans/2026-09-22-macos-one-line-installer-e2e-checklist.md
git commit -m "feat: add safe macOS installer removal"
```

### Task 9: Run the full verification gate and clean-macOS E2E

**Files:**
- Modify: `docs/plans/2026-09-22-macos-one-line-installer-e2e-checklist.md`

**Step 1: Run the repository verification gate**

Run: `npm run check`

Expected: formatting, lint, type checking, all tests, and production build PASS.

**Step 2: Run and record the manual clean-macOS E2E**

Use the approved public bootstrap command only after its URL/metadata decisions are complete. Run the cases listed in the Test approach section, inspect `launchctl print` and the generated plist for the managed absolute node path, and capture only non-sensitive pass/fail evidence in the checklist.

**Step 3: Commit verification evidence**

```bash
git add docs/plans/2026-09-22-macos-one-line-installer-e2e-checklist.md
git commit -m "test: verify macOS one-line installation"
```

Do not make this commit, claim public installability, or publish a bootstrap command unless the full gate and the clean-macOS E2E have actually passed.
