import { en, type Translations } from "./locales/en.js";
import { es } from "./locales/es.js";
import { zhTW } from "./locales/zh-TW.js";

export type { Translations };
export { en };

/** A language code from `src/report/languages.ts`, e.g. "zh-TW". */
export type Language = string;

export const defaultLanguage: Language = "zh-TW";
export const fallbackLanguage: Language = "en";

/** The packs that ship with the app, keyed by language code. */
export const translations = {
  en,
  "zh-TW": zhTW,
  es,
} satisfies Record<string, Translations>;

export type BuiltInLanguage = keyof typeof translations;

export function isBuiltInLanguage(code: string): code is BuiltInLanguage {
  return Object.hasOwn(translations, code);
}

/** Fills each `{name}` in a template; a name with no value is left as written. */
export function format(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

/** The placeholder names in a template, in order of first appearance. */
export function placeholdersOf(template: string): string[] {
  return [
    ...new Set(
      [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string),
    ),
  ];
}

function mergeOverEnglish(reference: unknown, pack: unknown): unknown {
  if (typeof reference === "string") {
    return typeof pack === "string" ? pack : reference;
  }
  const source =
    pack && typeof pack === "object" ? (pack as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(reference as Record<string, unknown>).map(([key, value]) => [
      key,
      mergeOverEnglish(value, source[key]),
    ]),
  );
}

/** Any pack, complete or not, as a full pack: a missing key shows English. */
export function withEnglishFallback(pack: unknown): Translations {
  return mergeOverEnglish(en, pack) as Translations;
}

// Task L2: packs for languages built on demand are not known at compile
// time, so they live in this runtime registry instead of `translations`.
// A page reload starts empty; the caller (web/language-runtime.ts) reloads a
// saved language's cached pack from the server at startup.
const runtimePacks = new Map<string, Translations>();

/** Registers a validated pack for a non-built-in code; a missing key still
 * shows English (`withEnglishFallback`), matching a built-in pack's rule. */
export function registerLanguagePack(
  code: Language,
  pack: unknown,
): Translations {
  const full = withEnglishFallback(pack);
  runtimePacks.set(code, full);
  return full;
}

/** Whether a code's pack is ready to display: built in, or already loaded. */
export function hasLanguagePack(code: Language): boolean {
  return isBuiltInLanguage(code) || runtimePacks.has(code);
}

/** Forgets a runtime pack, e.g. after its cache file turns out to be gone. */
export function forgetLanguagePack(code: Language): void {
  runtimePacks.delete(code);
}

/** The pack for a language code; an unknown or not-yet-loaded code shows English. */
export function getTranslations(code: Language): Translations {
  if (isBuiltInLanguage(code)) return withEnglishFallback(translations[code]);
  return runtimePacks.get(code) ?? en;
}

/**
 * The language to start in from a saved value. Nothing saved keeps the app's
 * default; a saved code that has no pack falls back to English.
 */
export function resolveSavedLanguage(saved: string | null | undefined) {
  if (saved === null || saved === undefined) return defaultLanguage;
  return isBuiltInLanguage(saved) ? saved : fallbackLanguage;
}
