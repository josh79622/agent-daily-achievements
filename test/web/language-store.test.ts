import { describe, expect, test } from "vitest";
import {
  languageStorageKey,
  loadSavedLanguage,
  saveLanguageChoice,
} from "../../web/language-store.js";

interface Call {
  url: string;
  init?: RequestInit;
}

function fakeFetch(permission: unknown, calls: Call[]): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (!init) {
      return { ok: true, json: async () => ({ permission }) };
    }
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
}

const origin = "http://127.0.0.1:4317";

describe("Language choice persistence (LC-8)", () => {
  test("LC-8: a choice is saved in the browser and carried into a saved permission", async () => {
    const stored: Record<string, string> = {};
    const calls: Call[] = [];
    await saveLanguageChoice("es", {
      storage: { setItem: (key, value) => void (stored[key] = value) },
      fetchFn: fakeFetch(
        { sourceScope: ["claude-code"], preferredCli: "codex" },
        calls,
      ),
      origin,
    });

    expect(stored[languageStorageKey]).toBe("es");
    const put = calls.find((call) => call.init?.method === "PUT")!;
    expect(put.url).toBe("/api/summarizer/permission");
    expect(JSON.parse(put.init!.body as string)).toEqual({
      sourceScope: ["claude-code"],
      preferredCli: "codex",
      summaryLanguage: "es",
    });
    expect((put.init!.headers as Record<string, string>).origin).toBe(origin);
  });

  test("LC-8: with no saved permission the choice is kept locally and no permission is created", async () => {
    const stored: Record<string, string> = {};
    const calls: Call[] = [];
    await saveLanguageChoice("en", {
      storage: { setItem: (key, value) => void (stored[key] = value) },
      fetchFn: fakeFetch(null, calls),
      origin,
    });

    expect(stored[languageStorageKey]).toBe("en");
    expect(calls.filter((call) => call.init?.method === "PUT")).toEqual([]);
  });

  test("LC-8: blocked browser storage or a failed request does not throw", async () => {
    await expect(
      saveLanguageChoice("es", {
        storage: {
          setItem: () => {
            throw new Error("blocked");
          },
        },
        fetchFn: (async () => {
          throw new Error("offline");
        }) as unknown as typeof fetch,
        origin,
      }),
    ).resolves.toBeUndefined();
  });

  test("LC-8: a saved choice is read back, and blocked storage gives the default", () => {
    expect(
      loadSavedLanguage({
        getItem: (key) => (key === languageStorageKey ? "es" : null),
      }),
    ).toBe("es");
    expect(loadSavedLanguage({ getItem: () => "xx" })).toBe("en");
    expect(
      loadSavedLanguage({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe("zh-TW");
  });
});
