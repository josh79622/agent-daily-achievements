import { describe, expect, test } from "vitest";

import { directionFor, languageCatalog } from "../../src/report/languages.js";

// Task L3 (docs/plans/2026-09-21-task-l3-rtl-layout-test-cases.md), test
// cases L3-1, L3-2, L3-3: the pure direction lookup that both the page and
// the day-arrow glyphs are built from.
describe("directionFor (L3-1 to L3-3)", () => {
  test("L3-1: returns 'rtl' for ar, he, fa, ur", () => {
    for (const code of ["ar", "he", "fa", "ur"]) {
      expect(directionFor(code)).toBe("rtl");
    }
  });

  test("L3-2: returns 'ltr' for every other catalog code, including zh-TW and en", () => {
    const rtl = new Set(["ar", "he", "fa", "ur"]);
    for (const language of languageCatalog) {
      if (rtl.has(language.code)) continue;
      expect(directionFor(language.code)).toBe("ltr");
    }
    expect(directionFor("zh-TW")).toBe("ltr");
    expect(directionFor("en")).toBe("ltr");
  });

  test("L3-3: returns 'ltr' for an unknown code, so a bad saved value cannot flip the page", () => {
    expect(directionFor("xx-not-real")).toBe("ltr");
  });
});
