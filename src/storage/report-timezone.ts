// The report timezone the schedule uses to decide the 07:00 window
// (docs/decisions/2026-09-21-seven-am-report-window.md). Reading it never
// falls back to the machine's timezone: the 24-hour fallback decision
// (docs/decisions/2026-09-17-local-timezone-scheduling.md) says an
// unreadable or unavailable setting must not be silently replaced by an
// inferred one.

import { readFile } from "node:fs/promises";

export type ReportTimeZoneResult =
  { ok: true; timeZone: string } | { ok: false };

export async function readReportTimeZone(
  path: string | undefined,
): Promise<ReportTimeZoneResult> {
  if (!path) return { ok: false };
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch {
    return { ok: false };
  }
  try {
    const value = JSON.parse(contents) as Record<string, unknown>;
    const timeZone = value.timeZone;
    if (typeof timeZone !== "string" || !timeZone) return { ok: false };
    // Throws for a syntactically invalid IANA name.
    new Intl.DateTimeFormat("en-CA", { timeZone }).format();
    return { ok: true, timeZone };
  } catch {
    return { ok: false };
  }
}
