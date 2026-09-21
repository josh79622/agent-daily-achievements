// Runtime loading and on-demand building of a language pack (Task L2). Kept
// free of React so it can be unit-tested with a fake `fetch`, the way
// web/language-store.ts already is.

import {
  forgetLanguagePack,
  hasLanguagePack,
  isBuiltInLanguage,
  markLanguageCached,
  registerLanguagePack,
  setCachedLanguages,
  type Language,
} from "./i18n.js";

interface FetchDeps {
  fetchFn: typeof fetch;
}

/**
 * GET /api/locales/:code. Registers and returns the pack when the server has
 * one cached; otherwise leaves the registry untouched and returns false.
 */
export async function loadLanguagePack(
  code: Language,
  { fetchFn }: FetchDeps,
): Promise<boolean> {
  try {
    const response = await fetchFn(`/api/locales/${encodeURIComponent(code)}`);
    if (!response.ok) return false;
    const body = (await response.json()) as { pack?: unknown };
    if (!body?.pack) {
      forgetLanguagePack(code);
      return false;
    }
    registerLanguagePack(code, body.pack);
    markLanguageCached(code);
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/locales (Task L4): marks every code the server already has a
 * pack for as cached, without loading any of those packs into memory — a
 * pack is still only fetched when its language is actually chosen. Called
 * once at startup so a reload offers every already-built language, not
 * only the saved one. A failed request leaves the cached set untouched, so
 * the dropdown looks exactly as it does today and no error is shown
 * (test L4-8).
 */
export async function loadCachedLanguageList({
  fetchFn,
}: FetchDeps): Promise<void> {
  try {
    const response = await fetchFn("/api/locales");
    if (!response.ok) return;
    const body = (await response.json()) as { codes?: unknown };
    if (!Array.isArray(body?.codes)) return;
    setCachedLanguages(
      body.codes.filter((code): code is string => typeof code === "string"),
    );
  } catch {
    // Left untouched (L4-8).
  }
}

export type LanguageSwitchOutcome =
  { ok: true; language: Language } | { ok: false };

/**
 * Ensures a chosen language's pack is in memory before the page is allowed
 * to switch into it (test L4-6): a built-in or already-loaded code resolves
 * immediately; a cached-but-unloaded code is fetched first, and only
 * resolves to `ok: true` once that fetch has completed, so the caller never
 * renders a language whose pack isn't loaded yet (which would show English
 * under the new language's label). If the pack turns out to be gone, the
 * switch is abandoned and the caller should stay on the current language.
 */
export async function ensureLanguageLoaded(
  code: Language,
  deps: FetchDeps,
): Promise<LanguageSwitchOutcome> {
  if (isBuiltInLanguage(code) || hasLanguagePack(code))
    return { ok: true, language: code };
  const loaded = await loadLanguagePack(code, deps);
  return loaded ? { ok: true, language: code } : { ok: false };
}

/**
 * The language to actually start a fresh page load in for a saved code
 * (test L2-23, L2-24): a built-in code is used as-is; a saved on-demand code
 * loads its cached pack and is used when found, or falls back to English
 * with `available: false` when the cache file is gone, so the caller can
 * still offer it as addable again.
 */
export async function resolveRuntimeLanguage(
  saved: Language,
  deps: FetchDeps,
): Promise<{ language: Language; available: boolean }> {
  if (isBuiltInLanguage(saved)) return { language: saved, available: true };
  const loaded = await loadLanguagePack(saved, deps);
  return loaded
    ? { language: saved, available: true }
    : { language: "en", available: false };
}

export type BuildOutcome = { ok: true } | { ok: false; reason: string };

const defaultFailureReason = "Could not add this language. Try again.";

/**
 * POST /api/locales/:code/build. Registers the returned pack on success so
 * the language becomes immediately selectable (test L2-21); returns a short
 * failure reason otherwise, without registering anything (test L2-22).
 */
export async function buildLanguagePack(
  code: Language,
  { fetchFn, origin }: FetchDeps & { origin: string },
): Promise<BuildOutcome> {
  let body: { pack?: unknown; error?: { message?: unknown } } | undefined;
  try {
    const response = await fetchFn(
      `/api/locales/${encodeURIComponent(code)}/build`,
      { method: "POST", headers: { origin } },
    );
    body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const reason = body?.error?.message;
      return {
        ok: false,
        reason: typeof reason === "string" ? reason : defaultFailureReason,
      };
    }
  } catch {
    return { ok: false, reason: defaultFailureReason };
  }
  if (!body?.pack) return { ok: false, reason: defaultFailureReason };
  registerLanguagePack(code, body.pack);
  markLanguageCached(code);
  return { ok: true };
}
