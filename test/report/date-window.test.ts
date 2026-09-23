import { describe, expect, test } from "vitest";

import {
  currentOpenWindow,
  mostRecentFinishedWindow,
  nextCalendarDate,
  previousCalendarDate,
  reportDateFor,
} from "../../src/report/date-window.js";

// Task W1 (docs/plans/2026-09-23-task-w1-frontend-date-window-test-cases.md),
// test cases W1-1 to W1-8: 07:00 report window boundaries and timezone handling.
// Decision: docs/decisions/2026-09-21-seven-am-report-window.md.

describe("Date window boundaries (W1-1 to W1-8)", () => {
  test("W1-1: given local time is 09:00 on 18 Sep, when open window is computed, then it is 18 Sep", () => {
    const now = new Date("2026-09-18T09:00:00Z");
    expect(currentOpenWindow(now, "UTC")).toBe("2026-09-18");
    expect(reportDateFor(now, "UTC")).toBe("2026-09-18");
  });

  test("W1-2: given local time is 01:30 on 19 Sep, when open window is computed, then it is 18 Sep", () => {
    const now = new Date("2026-09-19T01:30:00Z");
    expect(currentOpenWindow(now, "UTC")).toBe("2026-09-18");
    expect(reportDateFor(now, "UTC")).toBe("2026-09-18");
  });

  test("W1-3: given local time is exactly 07:00:00 on 19 Sep, when open window is computed, then it is 19 Sep (start-inclusive)", () => {
    const now = new Date("2026-09-19T07:00:00Z");
    expect(currentOpenWindow(now, "UTC")).toBe("2026-09-19");
    expect(reportDateFor(now, "UTC")).toBe("2026-09-19");
  });

  test("W1-4: given local time is 06:59:59 on 19 Sep, when open window is computed, then it is 18 Sep (end-exclusive)", () => {
    const now = new Date("2026-09-19T06:59:59Z");
    expect(currentOpenWindow(now, "UTC")).toBe("2026-09-18");
    expect(reportDateFor(now, "UTC")).toBe("2026-09-18");
  });

  test("W1-5: given local time is 01:30 on 19 Sep, when most recently finished window is computed, then it is 17 Sep", () => {
    const now = new Date("2026-09-19T01:30:00Z");
    expect(mostRecentFinishedWindow(now, "UTC")).toBe("2026-09-17");
  });

  test("W1-6: given local time is 07:00:00 on 19 Sep, when most recently finished window is computed, then it is 18 Sep", () => {
    const now = new Date("2026-09-19T07:00:00Z");
    expect(mostRecentFinishedWindow(now, "UTC")).toBe("2026-09-18");
  });

  test("W1-7: given a daylight-saving transition day, when windows are evaluated across 07:00, then no date is skipped or duplicated", () => {
    // America/New_York springs forward on 2026-03-08 at 02:00 EST -> 03:00 EDT.
    const timeZone = "America/New_York";

    // 10:59:59 UTC on 2026-03-08 is 06:59:59 EDT (end-exclusive: open window is 2026-03-07, finished is 2026-03-06).
    const justBeforeTransition = new Date("2026-03-08T10:59:59Z");
    expect(currentOpenWindow(justBeforeTransition, timeZone)).toBe(
      "2026-03-07",
    );
    expect(mostRecentFinishedWindow(justBeforeTransition, timeZone)).toBe(
      "2026-03-06",
    );

    // 11:00:00 UTC on 2026-03-08 is 07:00:00 EDT (start-inclusive: open window is 2026-03-08, finished is 2026-03-07).
    const atTransition = new Date("2026-03-08T11:00:00Z");
    expect(currentOpenWindow(atTransition, timeZone)).toBe("2026-03-08");
    expect(mostRecentFinishedWindow(atTransition, timeZone)).toBe("2026-03-07");

    // 11:00:00 UTC on 2026-03-09 is 07:00:00 EDT (the next day at 07:00: open window is 2026-03-09, finished is 2026-03-08).
    const followingDay = new Date("2026-03-09T11:00:00Z");
    expect(currentOpenWindow(followingDay, timeZone)).toBe("2026-03-09");
    expect(mostRecentFinishedWindow(followingDay, timeZone)).toBe("2026-03-08");
  });

  test("W1-8: given an explicit timezone, when window date is computed, then it strictly evaluates according to that timezone's wall clock", () => {
    // 2026-09-18T22:30:00Z is 2026-09-19 06:30 in Asia/Taipei (UTC+8) -> open window 2026-09-18, finished 2026-09-17.
    // In Australia/Sydney (UTC+10), it is 2026-09-19 08:30 -> open window 2026-09-19, finished 2026-09-18.
    const timestamp = "2026-09-18T22:30:00Z";
    const date = new Date(timestamp);

    expect(reportDateFor(timestamp, "Asia/Taipei")).toBe("2026-09-18");
    expect(currentOpenWindow(date, "Asia/Taipei")).toBe("2026-09-18");
    expect(mostRecentFinishedWindow(date, "Asia/Taipei")).toBe("2026-09-17");

    expect(reportDateFor(timestamp, "Australia/Sydney")).toBe("2026-09-19");
    expect(currentOpenWindow(date, "Australia/Sydney")).toBe("2026-09-19");
    expect(mostRecentFinishedWindow(date, "Australia/Sydney")).toBe(
      "2026-09-18",
    );
  });
});

describe("Calendar date helpers", () => {
  test("previousCalendarDate steps back one day across month and year boundaries", () => {
    expect(previousCalendarDate("2026-09-19")).toBe("2026-09-18");
    expect(previousCalendarDate("2026-03-01")).toBe("2026-02-28");
    expect(previousCalendarDate("2024-03-01")).toBe("2024-02-29"); // leap year
    expect(previousCalendarDate("2026-01-01")).toBe("2025-12-31");
    expect(() => previousCalendarDate("invalid")).toThrow(
      "Invalid date: invalid",
    );
  });

  test("nextCalendarDate steps forward one day across month and year boundaries", () => {
    expect(nextCalendarDate("2026-09-18")).toBe("2026-09-19");
    expect(nextCalendarDate("2026-02-28")).toBe("2026-03-01");
    expect(nextCalendarDate("2024-02-28")).toBe("2024-02-29"); // leap year
    expect(nextCalendarDate("2025-12-31")).toBe("2026-01-01");
    expect(() => nextCalendarDate("invalid")).toThrow("Invalid date: invalid");
  });
});
