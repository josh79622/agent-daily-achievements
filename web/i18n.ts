import { en, type Translations } from "./locales/en.js";
import { es } from "./locales/es.js";
import { zhTW } from "./locales/zh-TW.js";
import {
  builtInLanguageCodes,
  type BuiltInLanguage,
  isBuiltInLanguage,
} from "../src/report/languages.js";

export type { Translations };
export { en, builtInLanguageCodes, type BuiltInLanguage, isBuiltInLanguage };

/** A language code from `src/report/languages.ts`, e.g. "zh-TW". */
export type Language = string;

export const defaultLanguage: Language = "zh-TW";
export const fallbackLanguage: Language = "en";

/** The packs that ship with the app, keyed by language code. */
export const translations = {
  en,
  "zh-TW": zhTW,
  es,
} satisfies Record<BuiltInLanguage, Translations>;

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

// Task L4: codes the server has a pack file for on disk, from GET
// /api/locales at startup, kept up to date after a successful Add. This is
// deliberately a separate question from `runtimePacks` above: "cached" (on
// disk) is what web/language-options.ts asks; "loaded" (in memory) is what
// `getTranslations` keeps asking. Do not merge the two.
const cachedLanguageCodes = new Set<string>();

/** Replaces the full set of cached codes, e.g. from a GET /api/locales reply. */
export function setCachedLanguages(codes: Iterable<Language>): void {
  cachedLanguageCodes.clear();
  for (const code of codes) cachedLanguageCodes.add(code);
}

/** Marks one more code cached, e.g. right after it is built. */
export function markLanguageCached(code: Language): void {
  cachedLanguageCodes.add(code);
}

/** Whether a code has a pack on disk (Task L4); independent of `hasLanguagePack`. */
export function hasCachedLanguagePack(code: Language): boolean {
  return cachedLanguageCodes.has(code);
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
