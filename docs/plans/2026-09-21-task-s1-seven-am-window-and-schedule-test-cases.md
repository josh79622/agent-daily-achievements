# Task S1 — the 07:00 report window and the daily schedule: test cases (for approval)

Status: awaiting Josh's approval. No code until then (AGENTS.md).

Decisions behind this: `docs/decisions/2026-09-21-seven-am-report-window.md`.

## What cannot be seen now → what will be visible when done

Now: a report only exists if you open the page and press the generate button, and a
"day" means midnight to midnight.
Done: at 07:00 a macOS job generates yesterday's report on its own, covering
07:00 to 07:00, and it does not generate one that already exists.

## Design

- One pure function turns a timestamp into its report date: shift by minus seven
  hours in the stored report timezone, then take the calendar date.
- The collector, the report file name and the date picker all use that function.
  Nothing else decides what day a record belongs to.
- A `launchd` job runs a Node entry point at 07:00. It picks the most recent window
  that has ended, checks whether that report already exists, and generates it if not.
- The job is a separate entry point from the web server. It does not need the server.
- Reports already on disk keep their midnight boundaries and are never regenerated.

## Test cases

Given/When/Then. "Report date" means the date a report is filed under.

### The window

- **S1-1** Given a record at 09:00 on 18 Sep, when its report date is taken, then it is 18 Sep.
- **S1-2** Given a record at 01:30 on 19 Sep, when its report date is taken, then it is 18 Sep.
- **S1-3** Given a record at exactly 07:00 on 19 Sep, when its report date is taken, then it is
  19 Sep. The window is start-inclusive and end-exclusive.
- **S1-4** Given a record at 06:59:59 on 19 Sep, when its report date is taken, then it is 18 Sep.
- **S1-5** Given a stored timezone different from the machine's, when a report date is taken,
  then the stored timezone decides it.
- **S1-6** Given a timezone with daylight saving, when a report date is taken on the day the
  clocks change, then the window still starts at local 07:00 and no day is skipped or doubled.

### Collecting a day

- **S1-7** Given records spread across 18 Sep 06:00, 12:00 and 19 Sep 03:00, when the 18 Sep
  report is collected, then it holds the 12:00 and the 19 Sep 03:00 records and not the 06:00 one.
- **S1-8** Given a session whose activity falls in the 18 Sep window, when that report is
  collected, then the session's earlier context is included as the cross-day rule already says.

### The scheduled run

- **S1-9** Given the job runs at 07:00 on 19 Sep, when it picks a window, then it picks 18 Sep.
- **S1-10** Given the 18 Sep report already exists, when the job runs, then it generates nothing
  and calls no provider.
- **S1-11** Given no report for 18 Sep, when the job runs, then it generates exactly one report,
  for 18 Sep.
- **S1-12** Given the Mac was off for four days, when the job runs on waking, then it generates
  only the most recent finished window and leaves the older days empty.
- **S1-13** Given the job runs twice in the same morning, when the second run starts, then it
  generates nothing.
- **S1-14** Given the summarizer has no permission saved, when the job runs, then it generates
  nothing and says why, rather than sending anything.
- **S1-15** Given the provider fails, when the job runs, then it exits with a failure status and
  writes no partial report.
- **S1-16** Given the stored timezone is unreadable, when the job runs, then it does not invent
  one, per the existing 24-hour fallback decision.

### The launchd job

- **S1-17** Given the generated `.plist`, when it is read, then it runs the job entry point at
  07:00 daily, with the repository's Node runtime.
- **S1-18** Given the job is installed twice, when it is installed again, then the existing job
  is replaced, not duplicated.

## Verification beyond unit tests

I will run the job entry point by hand against the real data for a day that has no report, read
its output, and confirm the report lands under the expected date. That is one real provider
call, which I will ask you to approve before running. Installing the launchd job on your Mac is
a separate step I will also ask about first.
