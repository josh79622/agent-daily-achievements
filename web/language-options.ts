import {
  formatLanguageLabel,
  languageCatalog,
} from "../src/report/languages.js";
import { hasLanguagePack, isBuiltInLanguage } from "./i18n.js";

/**
 * "built-in": ships with the app. "added": a validated on-demand pack is
 * already loaded and the language is selectable. "addable": not yet built;
 * the dropdown offers an Add button. Task L3 dropped "unavailable": the
 * four right-to-left codes are "addable" like any other catalog code.
 */
export type LanguageOptionStatus = "built-in" | "added" | "addable";

export interface LanguageOption {
  code: string;
  /** "English name (native name)". */
  label: string;
  /** Kept for the existing callers/tests; equivalent to `status === "built-in"`. */
  builtIn: boolean;
  status: LanguageOptionStatus;
}

function statusFor(code: string): LanguageOptionStatus {
  if (isBuiltInLanguage(code)) return "built-in";
  if (hasLanguagePack(code)) return "added";
  return "addable";
}

const statusRank: Record<LanguageOptionStatus, number> = {
  "built-in": 0,
  added: 1,
  addable: 2,
};

/** Lower-case, accent-free text, so "espanol" finds "Español". */
function foldForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/**
 * The dropdown's entries for a search text: built-in languages first, the
 * rest in catalog order. An empty search lists every language.
 */
export function searchLanguageOptions(query: string): LanguageOption[] {
  const needle = foldForSearch(query);
  const options = languageCatalog
    .filter(
      (language) =>
        needle === "" ||
        foldForSearch(language.english).includes(needle) ||
        foldForSearch(language.native).includes(needle) ||
        foldForSearch(language.code).includes(needle),
    )
    .map((language) => {
      const status = statusFor(language.code);
      return {
        code: language.code,
        label: formatLanguageLabel(language),
        builtIn: status === "built-in",
        status,
      };
    });
  // A stable sort keeps each group in the catalog's own order (test L2-19).
  return [...options].sort(
    (a, b) => statusRank[a.status] - statusRank[b.status],
  );
}
