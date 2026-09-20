import {
  formatLanguageLabel,
  languageCatalog,
} from "../src/report/languages.js";
import { isBuiltInLanguage } from "./i18n.js";

export interface LanguageOption {
  code: string;
  /** "English name (native name)". */
  label: string;
  builtIn: boolean;
}

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
    .map((language) => ({
      code: language.code,
      label: formatLanguageLabel(language),
      builtIn: isBuiltInLanguage(language.code),
    }));
  return [
    ...options.filter((option) => option.builtIn),
    ...options.filter((option) => !option.builtIn),
  ];
}
