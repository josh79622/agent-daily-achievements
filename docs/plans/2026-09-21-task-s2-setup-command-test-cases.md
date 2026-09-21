# Task S2 — the setup command: test cases (for approval)

Status: awaiting Josh's approval. No code until then (AGENTS.md).

Decisions behind this: `docs/decisions/2026-09-17-local-timezone-scheduling.md`
(take the system timezone, ask only when it is unavailable or invalid) and
`docs/decisions/2026-09-21-seven-am-report-window.md` (the schedule reads it).
Josh chose a setup command over the server or the settings page, 2026-09-21.

## What cannot be seen now → what will be visible when done

Now: the scheduled job always declines with `no-timezone`, because nothing writes
`data/report-timezone.json`.
Done: `npm run setup` stores the timezone once and prints what it stored, and the
scheduled job can run.

## Design

- `npm run setup` reads the Mac's system timezone, writes `data/report-timezone.json`,
  and prints the stored value.
- An existing file is kept, not overwritten. `--force <zone>` replaces it.
- If the system timezone is missing or invalid, the command writes nothing and tells
  the user to run it again with an explicit zone. It never guesses from the clock.
- The logic is a pure function over injected dependencies; the script is a thin wrapper,
  the way `scripts/install-launchd.mjs` wraps `launchd-install.ts`.
- It becomes step one of the install instructions. Out of scope here: the launchd
  install, and the settings-page control for changing the zone later.

## Test cases

Given/When/Then.

- **S2-1** Given no stored file and a valid system timezone, when setup runs, then the file
  holds that timezone and the result says it was written.
- **S2-2** Given a stored file, when setup runs, then the file is unchanged and the result
  says it was kept.
- **S2-3** Given a stored file and an explicit zone with `--force`, when setup runs, then the
  file holds the new zone.
- **S2-4** Given no system timezone, when setup runs, then nothing is written and the result
  asks for an explicit zone.
- **S2-5** Given an invalid system timezone, when setup runs, then nothing is written and the
  result asks for an explicit zone.
- **S2-6** Given an explicit zone that is not a real IANA name, when setup runs, then nothing
  is written and the result names the bad value.
- **S2-7** Given the file is written, when it is read back by the schedule's reader, then the
  reader accepts it.
- **S2-8** Given a stored file that is corrupt, when setup runs, then it is treated as absent
  and replaced, and the result says so.
- **S2-9** Given the data directory does not exist, when setup runs, then it is created.
- **S2-10** Given setup fails to write, when it returns, then it exits with a failure status.

## Verification beyond unit tests

I will run `npm run setup` on this Mac for real and show you the file it writes — it only
touches `data/report-timezone.json`, no provider call. Then the scheduled job stops
declining, and the end-to-end run of Task S1 becomes possible; that run needs one provider
call, which I will ask you to approve separately.
