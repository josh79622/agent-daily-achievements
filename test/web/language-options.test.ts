import { describe, expect, test } from "vitest";
import { languageCatalog } from "../../src/report/languages.js";
import {
  hasLanguagePack,
  setCachedLanguages,
  translations,
} from "../../web/i18n.js";
import { searchLanguageOptions } from "../../web/language-options.js";

describe("Language dropdown options (LC-6, LC-7)", () => {
  test("LC-6: every catalog entry has an English and a native name, with a unique code", () => {
    const codes = new Set<string>();
    for (const language of languageCatalog) {
      expect(language.english.trim()).not.toBe("");
      expect(language.native.trim()).not.toBe("");
      codes.add(language.code);
    }
    expect(codes.size).toBe(languageCatalog.length);
  });

  test("LC-6: every built-in language is in the catalog", () => {
    const codes = new Set(languageCatalog.map((language) => language.code));
    for (const code of Object.keys(translations)) {
      expect(codes.has(code)).toBe(true);
    }
  });

  test("LC-6: each option is labelled 'English name (native name)' and built-ins are marked and listed first", () => {
    const options = searchLanguageOptions("");
    expect(options).toHaveLength(languageCatalog.length);

    const spanish = options.find((option) => option.code === "es")!;
    expect(spanish.label).toBe("Spanish (Español)");
    expect(spanish.builtIn).toBe(true);
    expect(options.find((option) => option.code === "zh-TW")!.label).toBe(
      "Traditional Chinese (繁體中文)",
    );
    expect(options.find((option) => option.code === "ja")!.builtIn).toBe(false);

    const builtInCount = Object.keys(translations).length;
    expect(options.slice(0, builtInCount).every((o) => o.builtIn)).toBe(true);
    expect(options.slice(builtInCount).every((o) => !o.builtIn)).toBe(true);
  });

  test("LC-7: searching by English name, native name, or code finds the language", () => {
    expect(searchLanguageOptions("span").map((o) => o.code)).toEqual(["es"]);
    expect(searchLanguageOptions("español").map((o) => o.code)).toEqual(["es"]);
    expect(searchLanguageOptions("中").map((o) => o.code)).toEqual([
      "zh-TW",
      "zh-CN",
    ]);
    expect(searchLanguageOptions("zh-tw").map((o) => o.code)).toEqual([
      "zh-TW",
    ]);
    expect(searchLanguageOptions("日本語").map((o) => o.code)).toEqual(["ja"]);
  });

  test("LC-7: search ignores case, accents and surrounding spaces", () => {
    expect(searchLanguageOptions("  SPAN ").map((o) => o.code)).toEqual(["es"]);
    expect(searchLanguageOptions("espanol").map((o) => o.code)).toEqual(["es"]);
    expect(searchLanguageOptions("FRANCAIS").map((o) => o.code)).toEqual([
      "fr",
    ]);
  });

  test("LC-7: a search with no match returns nothing", () => {
    expect(searchLanguageOptions("klingon")).toEqual([]);
  });
});

describe("Task L2 dropdown grouping (L2-19)", () => {
  // Task L4: "added" now means cached on disk, not loaded in memory, so
  // this marks `ko` cached (via `setCachedLanguages`, what a GET
  // /api/locales reply drives) instead of registering its pack.
  test("L2-19: built-in, then added, then the rest (addable), each in catalog order", () => {
    try {
      setCachedLanguages(["ko"]);

      const options = searchLanguageOptions("");
      const builtInCount = Object.keys(translations).length;

      expect(
        options.slice(0, builtInCount).every((o) => o.status === "built-in"),
      ).toBe(true);
      expect(options[builtInCount]!.code).toBe("ko");
      expect(options[builtInCount]!.status).toBe("added");

      const rest = options.slice(builtInCount + 1);
      expect(rest.every((o) => o.status === "addable")).toBe(true);
      // Catalog order is preserved within the "rest" group.
      const restCodes = rest.map((o) => o.code);
      const catalogOrderMinusHandled = languageCatalog
        .map((l) => l.code)
        .filter(
          (code) => !Object.keys(translations).includes(code) && code !== "ko",
        );
      expect(restCodes).toEqual(catalogOrderMinusHandled);
    } finally {
      setCachedLanguages([]);
    }
  });

  // Task L3 (docs/plans/2026-09-21-task-l3-rtl-layout-test-cases.md):
  // replaces the old L2-19 "a right-to-left language is 'unavailable'" case.
  test("L3-15: ar, he, fa, ur report 'addable'; 'unavailable' no longer occurs for any catalog code", () => {
    const options = searchLanguageOptions("");
    for (const code of ["ar", "he", "fa", "ur"]) {
      expect(options.find((o) => o.code === code)!.status).toBe("addable");
    }
    const allowedStatuses = new Set(["built-in", "added", "addable"]);
    expect(options.every((o) => allowedStatuses.has(o.status))).toBe(true);
    const japanese = options.find((o) => o.code === "ja")!;
    expect(japanese.status).toBe("addable");
  });
});

// Task L4 (docs/plans/2026-09-21-task-l4-cached-languages-stay-added-test-cases.md).
describe("Cached-but-unloaded languages stay added (L4-5, L4-7)", () => {
  test("L4-5: a cached-but-not-loaded language is selectable, has no Add button, and sits after the built-ins", () => {
    try {
      setCachedLanguages(["ja"]);
      // "Cached" and "loaded" are separate questions: ja was never
      // registered into the in-memory runtime registry.
      expect(hasLanguagePack("ja")).toBe(false);

      const options = searchLanguageOptions("");
      const builtInCount = Object.keys(translations).length;
      const japanese = options.find((o) => o.code === "ja")!;

      expect(japanese.status).toBe("added");
      expect(options.indexOf(japanese)).toBeGreaterThanOrEqual(builtInCount);
      expect(
        options.slice(0, builtInCount).every((o) => o.status === "built-in"),
      ).toBe(true);
    } finally {
      setCachedLanguages([]);
    }
  });

  test("L4-7: once the cache file is gone and the list is fetched again, the language goes back to 'addable'", () => {
    try {
      setCachedLanguages(["ja"]);
      expect(
        searchLanguageOptions("").find((o) => o.code === "ja")!.status,
      ).toBe("added");

      // The file was deleted; a fresh GET /api/locales no longer lists it.
      setCachedLanguages([]);

      expect(
        searchLanguageOptions("").find((o) => o.code === "ja")!.status,
      ).toBe("addable");
    } finally {
      setCachedLanguages([]);
    }
  });
});
