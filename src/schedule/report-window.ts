// Which report day the schedule should generate right now. Decision:
// docs/decisions/2026-09-21-seven-am-report-window.md ("the run happens at
// 07:00 on D+1 and produces the report for D"; "a wake after several missed
// days generates only the most recent completed window").

import { reportDateFor } from "../collector/local-collector.js";

/**
 * The most recently *finished* `[D 07:00, D+1 07:00)` window as of `now`.
 *
 * `reportDateFor(now, timeZone)` is the report date of the window `now`
 * currently sits inside — which, by definition, has not finished yet. The
 * most recently finished window is always the one immediately before it,
 * so this only ever needs to look at `now`, regardless of how long ago the
 * schedule last actually ran (S1-9, S1-12): a Mac woken after several missed
 * days still targets exactly one date, the most recent finished window, and
 * older missed days stay empty.
 */
export function mostRecentFinishedWindow(now: Date, timeZone: string): string {
  const openWindowDate = reportDateFor(now.toISOString(), timeZone);
  return previousCalendarDate(openWindowDate);
}

/** One calendar day before `date` (`YYYY-MM-DD`), independent of any zone. */
export function previousCalendarDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid date: ${date}`);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - 1);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
