# Daily Report UI Skeleton Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a clickable localhost page that generates, saves, reads back, and displays a fictional daily-achievements report.

**Architecture:** A framework-free TypeScript domain and JSON store sit behind a localhost-only Node HTTP server. A static HTML/CSS/TypeScript page calls the server, while one ordered verification command and CI prove formatting, linting, types, tests, and build.

**Tech Stack:** Node.js LTS, npm, TypeScript, Node HTTP, `node:test` through `tsx`, ESLint, Prettier, GitHub Actions.

---

### Task 1: Scaffold the TypeScript project and ordered quality gate

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `scripts/build.mjs`
- Modify: `AGENTS.md`

**Steps:**

1. Create the npm project with scripts for `format:check`, `lint`, `typecheck`, `test`, `build`, `check`, `dev`, and `start`. Pin a supported Node LTS range in `engines` and commit the npm lockfile.
2. Add strict TypeScript, ESLint, and Prettier configuration. Keep source as ES modules.
3. Add a build script that cleans `dist/`, runs the TypeScript compiler, and copies `web/` to `dist/web/` when that directory exists.
4. Run `npm install` and then `npm run check`. Expected at this scaffold stage: all commands exit 0 even though there are no application tests yet.
5. Update `AGENTS.md` with the now-approved skeleton runtime, package manager, framework choice, storage form, and verification command. Do not imply they settle later production storage or extension tooling.
6. Review and commit only the scaffold files with message `chore: scaffold TypeScript skeleton and checks`.

### Task 2: Generate a report from fictional evidence

**Files:**
- Create: `src/domain/report.ts`
- Create: `src/domain/sample-records.ts`
- Create: `src/domain/generate-sample-report.ts`
- Create: `test/domain/generate-sample-report.test.ts`

**Steps:**

1. Write a test using `node:test` and strict assertions. The test must require report date `2026-09-16`, at least one progress item, decision, and learning item, and exact traceable source IDs from the fictional records.
2. Run `npm test -- test/domain/generate-sample-report.test.ts`. Expected: failure because the generator module does not exist.
3. Add the smallest typed report model, fictional record fixture, and deterministic generator that satisfy the approved assertions. Do not call a model or inspect local histories.
4. Run the focused test. Expected: pass.
5. Run `npm run typecheck`. Expected: pass.
6. Review and commit with message `feat: generate a traceable fictional daily report`.

### Task 3: Persist and read back the report

**Files:**
- Create: `src/storage/report-store.ts`
- Create: `test/storage/report-store.test.ts`

**Steps:**

1. Write tests in a temporary directory for write/read equality and a typed not-found result when no report exists.
2. Run the focused test. Expected: failure because the store does not exist.
3. Implement a JSON file store that creates its directory, writes through a temporary file followed by rename, and parses the saved report.
4. Run the focused test. Expected: pass.
5. Run `npm run typecheck`. Expected: pass.
6. Review and commit with message `feat: persist generated reports locally`.

### Task 4: Expose the end-to-end HTTP route

**Files:**
- Create: `src/server/app.ts`
- Create: `src/server/index.ts`
- Create: `test/server/app.test.ts`

**Steps:**

1. Write integration tests against an ephemeral localhost port and temporary data directory. Confirm `POST /api/reports/sample` returns and saves a report, `GET /api/reports/latest` reads the same report, a missing report returns `404`, and an unknown API route returns `404` JSON.
2. Run the focused test. Expected: failure because the server factory does not exist.
3. Implement an injectable server factory and a production entry point bound to `127.0.0.1`. Keep errors structured and omit stack traces from responses.
4. Run the focused test. Expected: pass.
5. Run `npm run typecheck`. Expected: pass.
6. Review and commit with message `feat: add local sample-report API`.

### Task 5: Build the clickable report interface

**Files:**
- Create: `web/index.html`
- Create: `web/styles.css`
- Create: `web/app.ts`
- Create: `test/web/build-output.test.ts`
- Modify: `src/server/app.ts`
- Modify: `scripts/build.mjs`

**Steps:**

1. Write a build-output test requiring the built HTML to contain the fictional-data notice, **Generate sample report** control, and app mount point.
2. Run the focused test. Expected: failure because the web assets do not exist in the build output.
3. Create a responsive single-page interface with a calm dashboard header, source-status summary, empty state, loading/error states, and report sections with source chips. Keep accessibility labels, keyboard focus, and readable contrast.
4. Serve the built assets and compile the browser TypeScript. Do not introduce a UI framework.
5. Run the focused test and `npm run build`. Expected: both pass.
6. Start the built server, verify the page and both API endpoints with `curl`, then inspect the page in a browser at desktop and narrow widths.
7. Review and commit with message `feat: add clickable daily-report demo`.

### Task 6: Add CI and demonstrate the gate blocks failures

**Files:**
- Create: `.github/workflows/verify.yml`
- Create: `README.md`
- Modify: `docs/plans/2026-09-16-daily-report-skeleton-design.md`

**Steps:**

1. Add GitHub Actions using Node.js LTS, `npm ci`, and `npm run check` for pushes and pull requests.
2. Document local install, development, verification, build, and demo commands. Clearly label the demo as fictional and list excluded first-version features.
3. Deliberately change one focused assertion to an incorrect expected value and run `npm run check`. Expected: non-zero exit at the test step; retain the output as verification evidence but do not commit the deliberate failure.
4. Restore the assertion and run `npm run check`. Expected: formatting, lint, typecheck, all tests, and build exit 0.
5. Run `git diff --check`, inspect the complete branch diff, and verify no `data/`, credentials, or real conversation content is tracked.
6. Commit with message `ci: verify the daily-report skeleton`.

### Task 7: Review and hand off the demo

**Files:**
- Modify if needed after review: files from Tasks 1–6 only

**Steps:**

1. Run the complete `npm run check` again from a clean working tree.
2. Start the production build, generate a sample report through the UI/API, read it back, and capture the exact local URL.
3. Review the branch against the approved design and list anything intentionally deferred.
4. Apply only focused corrections found by the review, with separate failing-then-passing checks and commits.
5. Present the clickable demo to Josh before beginning any real-history collector work.
