import { resolveSavedLanguage, type Language } from "./i18n.js";

export const languageStorageKey = "daily_proof_language";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function loadSavedLanguage(storage: ReadableStorage): Language {
  try {
    return resolveSavedLanguage(storage.getItem(languageStorageKey));
  } catch {
    return resolveSavedLanguage(null);
  }
}

interface SaveLanguageDeps {
  storage: WritableStorage;
  fetchFn: typeof fetch;
  origin: string;
}

/**
 * Remembers a language choice in the browser and, when the user has already
 * saved a summary permission, carries the choice into it so the daily summary
 * uses the same language. It never creates a permission: with none saved, the
 * language travels with each generate request instead.
 */
export async function saveLanguageChoice(
  code: Language,
  { storage, fetchFn, origin }: SaveLanguageDeps,
): Promise<void> {
  try {
    storage.setItem(languageStorageKey, code);
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
  try {
    const response = await fetchFn("/api/summarizer/permission");
    const body = response.ok ? await response.json() : null;
    const saved = body?.permission;
    if (!saved) return;
    await fetchFn("/api/summarizer/permission", {
      method: "PUT",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({
        sourceScope: saved.sourceScope,
        preferredCli: saved.preferredCli,
        summaryLanguage: code,
      }),
    });
  } catch (error) {
    console.error("Failed to sync summary language", error);
  }
}
