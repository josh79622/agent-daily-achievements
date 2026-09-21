import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  forgetLanguagePack,
  format,
  getTranslations,
  placeholdersOf,
  registerLanguagePack,
  resolveSavedLanguage,
  translations,
  withEnglishFallback,
} from "../../web/i18n.js";

/** Every string in a pack, with its dotted key path. */
function flatten(value: unknown, path = ""): Map<string, unknown> {
  const entries = new Map<string, unknown>();
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (child && typeof child === "object") {
        for (const [k, v] of flatten(child, childPath)) entries.set(k, v);
      } else {
        entries.set(childPath, child);
      }
    }
  }
  return entries;
}

const english = flatten(translations.en);
const others = Object.entries(translations).filter(([code]) => code !== "en");

describe("Language packs (LC-1 to LC-5)", () => {
  test("the built-in languages are English, Traditional Chinese and Spanish", () => {
    expect(Object.keys(translations).sort()).toEqual(["en", "es", "zh-TW"]);
  });

  test("LC-1: every pack has exactly the English keys, and every value is a string", () => {
    for (const [code, pack] of Object.entries(translations)) {
      const entries = flatten(pack);
      expect([code, [...entries.keys()].sort()]).toEqual([
        code,
        [...english.keys()].sort(),
      ]);
      for (const [key, value] of entries) {
        expect([code, key, typeof value]).toEqual([code, key, "string"]);
        expect((value as string).trim()).not.toBe("");
      }
    }
  });

  test("LC-2: every pack keeps the same placeholders as English for each key", () => {
    for (const [code, pack] of others) {
      const entries = flatten(pack);
      for (const [key, englishValue] of english) {
        expect([code, key, placeholdersOf(entries.get(key) as string)]).toEqual(
          [code, key, placeholdersOf(englishValue as string)],
        );
      }
    }
  });

  test("LC-3: format fills each placeholder and leaves an unknown one as written", () => {
    expect(format("{n} sessions", { n: 4 })).toBe("4 sessions");
    expect(
      format("incomplete: {reason} · {sessions} · {issues}", {
        reason: "unreadable file",
        sessions: 2,
        issues: 3,
      }),
    ).toBe("incomplete: unreadable file · 2 · 3");
    expect(format("{date} and {date}", { date: "2026-09-18" })).toBe(
      "2026-09-18 and 2026-09-18",
    );
    expect(format("Hello {missing}", { n: 1 })).toBe("Hello {missing}");
    expect(format("no placeholders", { n: 1 })).toBe("no placeholders");
  });

  test("LC-3: format does not treat a value as a template or a prototype name as a value", () => {
    expect(format("{n}", { n: "{date}" })).toBe("{date}");
    expect(format("{toString}", {})).toBe("{toString}");
  });

  test("LC-4: a key missing from a pack shows the English text", () => {
    const partial = { header: { title: "Solo título" } };
    const merged = withEnglishFallback(partial);
    expect(merged.header.title).toBe("Solo título");
    expect(merged.header.settings).toBe(translations.en.header.settings);
    expect(merged.activity.sessionsCount).toBe(
      translations.en.activity.sessionsCount,
    );
    expect(flatten(merged).size).toBe(english.size);
  });

  test("LC-4: a non-string value in a pack is replaced by the English text", () => {
    const merged = withEnglishFallback({
      header: { title: 42, views: "not an object" },
    });
    expect(merged.header.title).toBe(translations.en.header.title);
    expect(merged.header.views.journal).toBe(
      translations.en.header.views.journal,
    );
  });

  test("LC-5: an unknown or corrupt saved language falls back to English", () => {
    expect(resolveSavedLanguage("xx")).toBe("en");
    expect(resolveSavedLanguage("")).toBe("en");
    expect(resolveSavedLanguage("__proto__")).toBe("en");
    expect(resolveSavedLanguage("constructor")).toBe("en");
    expect(getTranslations("xx")).toBe(translations.en);
    expect(getTranslations("toString")).toBe(translations.en);
  });

  test("LC-5: a valid saved language is kept, and nothing saved keeps the default", () => {
    expect(resolveSavedLanguage("es")).toBe("es");
    expect(resolveSavedLanguage("en")).toBe("en");
    expect(resolveSavedLanguage(null)).toBe("zh-TW");
    expect(getTranslations("es").header.dateToday).toBe("Hoy");
  });

  test("L2-25: an on-demand pack missing a key at display time still renders, with English for that key", () => {
    try {
      registerLanguagePack("ja", { header: { title: "こんにちは" } });
      const shown = getTranslations("ja");
      expect(shown.header.title).toBe("こんにちは");
      // Every other key falls back to English, same rule as a built-in pack.
      expect(shown.header.settings).toBe(translations.en.header.settings);
      expect(shown.activity.sessionsCount).toBe(
        translations.en.activity.sessionsCount,
      );
    } finally {
      forgetLanguagePack("ja");
    }
  });

  // Task L3 (docs/plans/2026-09-21-task-l3-rtl-layout-test-cases.md):
  // languageNotAvailable backed the removed "unavailable" dropdown status
  // (L3-15) and nothing renders it any more.
  test("L3-17: languageNotAvailable is gone from every built-in pack, and nothing in the language dropdown references it", () => {
    for (const pack of Object.values(translations)) {
      expect(
        (pack.header as Record<string, unknown>).languageNotAvailable,
      ).toBeUndefined();
    }
    const selectorSource = readFileSync(
      new URL("../../web/LanguageSelector.tsx", import.meta.url),
      "utf8",
    );
    expect(selectorSource).not.toMatch(/languageNotAvailable/);
  });
});
