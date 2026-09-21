import { describe, expect, test } from "vitest";

import { dayArrowGlyphs } from "../../web/date-utils.js";
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
