// Pure, browser-safe date calculations for the 07:00 daily report window.
// Decision: docs/decisions/2026-09-21-seven-am-report-window.md.
// Shared between the backend schedule/collector and the frontend web UI.
// This module must NOT import any Node built-ins (node:fs, node:path, node:os).

const sevenHoursMs = 7 * 60 * 60 * 1000;

/**
 * The instant's wall-clock date and time in `timeZone`, re-expressed as a
 * UTC instant carrying the same numbers. Arithmetic on the result is pure
 * calendar/clock arithmetic, unaffected by the zone's real UTC offset or any
 * daylight-saving change on the day in question.
 */
function zonedWallClockAsUtc(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Some locales format local midnight as hour "24" rather than "00".
  const hour = get("hour") % 24;
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
}

/**
 * The single place that decides what report day a record belongs to
 * (decision: docs/decisions/2026-09-21-seven-am-report-window.md). A report
 * covers `[D 07:00, D+1 07:00)` in `timeZone`, filed under `D`: shift the
 * timestamp back seven wall-clock hours in that zone, then take the
 * resulting calendar date.
 */
export function reportDateFor(
  timestamp: string | Date,
  timeZone: string,
): string {
  const instant =
    typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Invalid timestamp: ${String(timestamp)}`);
  }
  const wallClock = zonedWallClockAsUtc(instant, timeZone);
  const shifted = new Date(wallClock - sevenHoursMs);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

/** One calendar day after `date` (`YYYY-MM-DD`), independent of any zone. */
export function nextCalendarDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid date: ${date}`);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + 1);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The report date of the window currently in progress as of `now`. */
export function currentOpenWindow(now: Date, timeZone: string): string {
  return reportDateFor(now.toISOString(), timeZone);
}

/** The report date of the completed window preceding the current open window. */
export function mostRecentFinishedWindow(now: Date, timeZone: string): string {
  return previousCalendarDate(currentOpenWindow(now, timeZone));
}
