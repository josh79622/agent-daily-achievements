import { describe, expect, test } from "vitest";
import { languageCatalog } from "../../src/report/languages.js";
import { translations } from "../../web/i18n.js";
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
