# Synthetic set 02: labelled report cases

Status: **draft — awaiting Josh's approval** with
[the report contract design](../plans/2026-09-17-report-contract-design.md).

All records are fictional. Expectations are fixed before any validator, scorer,
prompt, or model run, and are not included in any model prompt. No Codex or
Claude Code run is approved against this set yet.

Each case is scored independently. Every case uses report date 2026-09-18 and
timezone `Australia/Sydney`. "Coverage" lists every source's collector state;
sources not listed are `not-enabled`.

Scoring order for each case: forbidden claims (critical), required items,
duplicate count, source-ID fidelity, status and incomplete sources, then manual
prose review.

## Case 01 — explicit completion evidence

- `codex-201` — Codex, Harbor project, 09:10–09:40. The focused cache test
  failed (4 passed, 1 failed). Codex changed cache-key hashing. The same test
  then passed (5 passed, 0 failed). A commit `fix: stable Harbor cache keys` was
  created.

Coverage: `codex` included; `claude-code` no-activity.

- Required: one `progress` item citing `codex-201`.
- Forbidden: none beyond general rules.
- Status: `complete`.

## Case 02 — intention without execution evidence

- `claude-web-201` — Claude web, 10:15. Josh wrote: "Tomorrow I'll refactor the
  billing module and send the design to Mira." No code, message, or sent item
  appears.
- `codex-202` — Codex, 11:00. Josh ran the Harbor lint command; it passed with
  no changes. Nothing else happened.

Coverage: `claude-web` included; `codex` included.

- Required: none.
- Forbidden: any item whose evidence is only `claude-web-201`.
- Manual: no text says the refactor happened or the design was sent. Running a
  passing lint with no change is not required as an achievement.
- Status: `complete` (zero achievements is correct).

## Case 03 — reasoned decision

- `claude-code-201` — Claude Code, Harbor, 13:05. After comparing JSON files and
  SQLite for the local cache, Josh said: "Concurrent writes corrupted the JSON
  cache twice this week, so we'll use SQLite." No code was changed yet.

Coverage: `claude-code` included.

- Required: one `decision` item citing `claude-code-201`.
- Manual: it must not say SQLite was implemented.
- Status: `complete`.

## Case 04 — demonstrated learning

- `chatgpt-web-201` — ChatGPT web, 15:30. Josh explained in his own words: "An
  idempotency key lets the server recognise a retried request and return the
  first result instead of charging twice." The model confirmed it was correct.
- `chatgpt-web-202` — ChatGPT web, 15:45. Josh pasted an article about vector
  clocks and asked for a summary. He did not restate or apply it.

Coverage: `chatgpt-web` included.

- Required: one `learning` item citing `chatgpt-web-201`.
- Forbidden: any `learning` item whose evidence is only `chatgpt-web-202`.
- Status: `complete`.

## Case 05 — duplicate cross-source activity

- `codex-203` — Codex, Harbor, 10:00. Fixed the retry-timeout bug; focused test
  failed then passed; commit created.
- `claude-code-202` — Claude Code, Harbor, 14:00. Josh said: "The retry-timeout
  fix Codex made this morning passed its test." They discussed backoff theory.
  No further change.

Coverage: `codex` included; `claude-code` included.

- Required: exactly one `progress` item citing both `codex-203` and
  `claude-code-202`.
- Duplicate: a second item citing either record for the same fix is a
  duplicate failure.
- Status: `complete`.

## Case 06 — conflicting evidence

- `codex-204` — Codex, Harbor, 09:30. The deploy-script test passed after a
  change; commit created.
- `claude-code-203` — Claude Code, Harbor, 17:20. Josh said: "CI shows the
  deploy-script test failing again after merge; not fixed yet." CI output with
  the failure is present. No later fix appears.

Coverage: `codex` included; `claude-code` included.

- Required: none.
- Forbidden: any item citing `codex-204` without also citing `claude-code-203`
  (design decision D2).
- Manual: no text says the deploy script is fixed.
- Status: `complete` (coverage is complete; the activity is unresolved, not
  missing data).

## Case 07 — missing or failed selected source

- `codex-205` — Codex, Harbor, 11:10. Updated the README install steps and
  verified them by running the documented commands; commit created.
- Claude Code is installed and selected, but its history could not be read
  (`unreadable`). No contents were obtained.
- Gemini web is enabled, but collection failed (`collection-failed`).
- ChatGPT web is not enabled.

Coverage: `codex` included; `claude-code` incomplete (`unreadable`);
`gemini-web` incomplete (`collection-failed`); `chatgpt-web` not-enabled.

- Required: one `progress` item citing `codex-205`.
- Status: `incomplete`, with incomplete sources exactly `claude-code` and
  `gemini-web`. `chatgpt-web` must not be reported incomplete.
- Manual: no text calls Claude Code or Gemini inactive.

## Case 08 — more than three plausible achievements

- `codex-206` — Codex, Harbor, 09:00. Fixed a pagination bug; test failed then
  passed; commit created.
- `claude-code-204` — Claude Code, Harbor, 11:00. Josh decided to drop Node 20
  support because the dependency requires Node 22 or later.
- `codex-207` — Codex, Harbor, 13:00. Josh asked why a test was flaky; they
  confirmed the cause was a shared temporary directory. No fix yet.
- `chatgpt-web-203` — ChatGPT web, 16:00. Josh correctly explained in his own
  words why a database index speeds reads but slows writes; model confirmed.
- `claude-web-202` — Claude web, 18:00. Josh wrote: "I'll fix the flaky test
  tomorrow."

Coverage: `codex`, `claude-code`, `chatgpt-web`, and `claude-web` included.

- Eligible: `progress` citing `codex-206`; `decision` citing `claude-code-204`;
  `clarification` citing `codex-207`; `learning` citing `chatgpt-web-203`.
- Required: exactly three items, each matching a different eligible activity.
  No priority among eligible activities is set (design decision D1).
- Forbidden: any item whose evidence is only `claude-web-202`.
- Status: `complete`. A candidate with four or more items is invalid and
  assembles as `incomplete` with `summary-invalid`.
