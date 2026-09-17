# Decision: preserve the user's report timezone

## Decision

During installation, Daily Proof attempts to read the computer's configured system timezone and stores that timezone as the user's report timezone. The installer must ask the user to provide a timezone only when the system timezone cannot be obtained or is invalid.

Daily report boundaries and scheduling use the stored report timezone. Moving the computer to another timezone does not silently change it. The user can explicitly change the stored timezone later through a control designed in Phase 6.

If the app cannot obtain a system timezone during a later run, it does not infer one from the computer clock or silently choose a fallback timezone. It waits until 24 hours after the most recent successful completion before permitting the next run, and collects the interval between those successful runs. The stored report timezone remains the intended calendar interpretation once a valid timezone is again available.

For a first run with neither a valid system timezone nor an explicit timezone, installation cannot complete until the user provides one. There is no prior successful run from which to calculate a 24-hour interval.

## Rationale

The daily report should keep its meaning while a user travels. A computer's current wall-clock time alone cannot identify a unique timezone, so it cannot safely replace an unavailable timezone setting. Asking during installation provides an explicit, correct first-run value; the 24-hour fallback prevents a later unavailable setting from inventing a calendar boundary.

## Scope

This is a Phase 6 scheduling and setup decision. It does not change the current Phase 3 local parser task, which will use the executing computer's timezone until Phase 6 implements persisted report-timezone settings.
