# Codex result: synthetic day 01

CLI: Codex 0.154.0. Model: `gpt-5.6-terra`. Route: `codex exec` with read-only sandbox, ephemeral session, user config and rules ignored, from an empty temporary directory using `shared-prompt.md` on stdin.

The first invocation exited 134 before reaching the model. In the temporary directory, `/usr/bin/env node` selected `/opt/homebrew/bin/node` (Node 25.8.1), which failed to load `libsimdjson.30.dylib`. The project directory resolved `node` to working Node 24.20.0. Retrying the identical prompt through `/opt/homebrew/opt/node@24/bin/node` and the installed Codex JavaScript launcher exited 0. This was an environment workaround, not a Homebrew repair.

Final response from the successful run, verbatim:

## Achievements

- Fixed the Atlas export-date bug so Sydney calendar dates are preserved; the focused test changed from 2 passed/1 failed to 3 passed/0 failed, and the fix was committed as `fix: preserve Sydney calendar day in Atlas export`. Sources: `codex-01`, `claude-code-01`.
- Decided not to apply for fictional Posting B because its weekday on-call requirement conflicts with current constraints, and narrowed the job search toward roles like Posting A. Source: `claude-web-01`.
- Demonstrated an accurate understanding of DNS TTL caching behavior, including why lowering TTL does not immediately invalidate existing cached answers. Source: `chatgpt-web-01`.

## Data coverage

- Covered records: `codex-01`, `claude-code-01`, `claude-web-01`, `chatgpt-web-01`, `claude-web-02`.
- `claude-web-02` contained only a plan to email a recruiter tomorrow, with no execution evidence; it is not included as an achievement.
- Incomplete for `gemini-01`: collection failed because the page was inaccessible, so Gemini activity is unknown.
