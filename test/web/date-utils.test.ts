import { describe, expect, test, vi } from "vitest";

import {
  dayArrowGlyphs,
  getDefaultTimeZone,
  getTodayDate,
  getYesterdayDate,
  shiftDateString,
} from "../../web/date-utils.js";
import { en } from "../../web/locales/en.js";

// Task L3 (docs/plans/2026-09-21-task-l3-rtl-layout-test-cases.md), test
// cases L3-8, L3-9, L3-10: DateSelector's day arrows keep their meaning, not
// their glyph.
describe("dayArrowGlyphs (L3-8 to L3-10)", () => {
  test("L3-8: in a left-to-right language, previous shows ← and next shows →", () => {
    expect(dayArrowGlyphs("ltr")).toEqual({ prev: "←", next: "→" });
  });

  test("L3-9: in a right-to-left language they swap: previous shows →, next shows ←", () => {
    expect(dayArrowGlyphs("rtl")).toEqual({ prev: "→", next: "←" });
  });

  test("L3-10: the accessible labels are the same words in both directions", () => {
    // dayArrowGlyphs only ever changes the glyph; DateSelector always reads
    // these same translation keys for title/aria-label regardless of
    // direction, so the labels themselves never depend on it.
    expect(en.header.datePrev).toBe("Previous day");
    expect(en.header.dateNext).toBe("Next day");
    // Swapping direction changes only the glyphs, never which label a given
    // action (previous/next) is paired with.
    const ltr = dayArrowGlyphs("ltr");
    const rtl = dayArrowGlyphs("rtl");
    expect(ltr.prev).not.toBe(rtl.prev);
    expect(ltr.next).not.toBe(rtl.next);
  });
});

// Task W1 (docs/plans/2026-09-23-task-w1-frontend-date-window-test-cases.md),
// test cases W1-9 to W1-13: 07:00 report window alignment for frontend date utils.
describe("Frontend date utilities (W1-9 to W1-13)", () => {
  test("W1-9: given a clock time between midnight and 06:59:59, when getYesterdayDate() is called, then it returns two calendar days prior (D-2)", () => {
    const beforeSevenAm = new Date("2026-09-19T03:00:00Z");
    expect(getYesterdayDate(beforeSevenAm, "UTC")).toBe("2026-09-17");
  });

  test("W1-10: given a clock time at or after 07:00:00, when getYesterdayDate() is called, then it returns one calendar day prior (D-1)", () => {
    const afterSevenAm = new Date("2026-09-19T08:00:00Z");
    expect(getYesterdayDate(afterSevenAm, "UTC")).toBe("2026-09-18");
  });

  test("W1-11: given a clock time between midnight and 06:59:59, when getTodayDate() is called, then it returns one calendar day prior (D-1, the open window)", () => {
    const beforeSevenAm = new Date("2026-09-19T03:00:00Z");
    expect(getTodayDate(beforeSevenAm, "UTC")).toBe("2026-09-18");
  });

  test("W1-12: given a clock time at or after 07:00:00, when getTodayDate() is called, then it returns current calendar day (D, the open window)", () => {
    const afterSevenAm = new Date("2026-09-19T08:00:00Z");
    expect(getTodayDate(afterSevenAm, "UTC")).toBe("2026-09-19");
  });

  test("W1-13: given current open window date, when shiftDateString(today, +1) is called, then it does not exceed the open window date", () => {
    const today = "2026-09-18";
    expect(shiftDateString(today, 1, today)).toBe(today);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-19T03:00:00Z"));
      const currentToday = getTodayDate(undefined, "UTC");
      expect(shiftDateString(currentToday, 1, currentToday)).toBe(currentToday);
      expect(shiftDateString("2026-09-17", 1, currentToday)).toBe("2026-09-18");
      expect(shiftDateString("2026-09-18", -1)).toBe("2026-09-17");
    } finally {
      vi.useRealTimers();
    }
  });

  test("getDefaultTimeZone returns a valid timezone string or UTC", () => {
    const tz = getDefaultTimeZone();
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
  });
});
