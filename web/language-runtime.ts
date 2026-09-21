// Runtime loading and on-demand building of a language pack (Task L2). Kept
// free of React so it can be unit-tested with a fake `fetch`, the way
// web/language-store.ts already is.

import {
  forgetLanguagePack,
  isBuiltInLanguage,
  registerLanguagePack,
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
    return true;
  } catch {
    return false;
  }
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
  return { ok: true };
}
