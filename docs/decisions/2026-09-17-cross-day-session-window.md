# Decision: include prior session context through the report day

## Decision

When a daily run begins on local calendar day `D`, it prepares the report for
the preceding local calendar day `D - 1`. For a session that had at least one
activity record on `D - 1`, include that session's records from its beginning
through the end of `D - 1`. The collection window is start-inclusive and
end-exclusive: `[session start, start of D)`.

A session is not included merely because it has older records in that window.
It must have actual activity on `D - 1`.

For example, a session active on days 1, 2, and 3 contributes records from:

- day 1 when the run occurs on day 2;
- days 1 and 2 when the run occurs on day 3;
- days 1, 2, and 3 when the run occurs on day 4.

If it had no activity on day 2, it is not included by the day-3 run even
though it has day-1 records.

## Rationale

Cross-day work is common. A daily report needs the preceding context of a
session that was active on its report day, while excluding later work that had
not happened by that day's end. Requiring report-day activity prevents an old,
inactive session from being included only because it has historical records.

## Consequences

- Parser and collection tests must distinguish eligibility (activity on the
  report day) from the complete context included for an eligible session.
- The saved report timezone determines the local day boundaries. The timezone
  is retained across travel unless the user explicitly changes it.
- This rule does not settle session-file deduplication; that remains a separate
  Phase 3 task.
