import { afterEach, describe, expect, test } from "vitest";
import {
  buildLanguagePack,
  ensureLanguageLoaded,
  loadCachedLanguageList,
  loadLanguagePack,
  resolveRuntimeLanguage,
} from "../../web/language-runtime.js";
import {
  forgetLanguagePack,
  getTranslations,
  hasCachedLanguagePack,
  hasLanguagePack,
  setCachedLanguages,
} from "../../web/i18n.js";
import { directionFor } from "../../src/report/languages.js";

const origin = "http://127.0.0.1:4317";

afterEach(() => {
  forgetLanguagePack("ja");
  forgetLanguagePack("ko");
  forgetLanguagePack("ar");
  setCachedLanguages([]);
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("Building a language pack (L2-20 to L2-22)", () => {
  test("L2-20: while a build is in flight, the pack is not yet registered (row would stay 'preparing')", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchFn = (() =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })) as unknown as typeof fetch;

    const promise = buildLanguagePack("ja", { fetchFn, origin });
    // Still unresolved: nothing has registered a pack, and nothing about the
    // current language selection changes just from calling build.
    expect(hasLanguagePack("ja")).toBe(false);

    resolveFetch(
      jsonResponse(200, { pack: { header: { title: "こんにちは" } } }),
    );
    await promise;
  });

  test("L2-21: on success the pack is registered and the language becomes selectable", async () => {
    const fetchFn = (async () =>
      jsonResponse(200, {
        pack: { header: { title: "こんにちは" } },
      })) as unknown as typeof fetch;

    const outcome = await buildLanguagePack("ja", { fetchFn, origin });

    expect(outcome).toEqual({ ok: true });
    expect(hasLanguagePack("ja")).toBe(true);
    // A missing key still shows English (existing withEnglishFallback, L2-25).
    expect(getTranslations("ja").header.settings).toBe("Settings");
    expect(getTranslations("ja").header.title).toBe("こんにちは");
  });

  test("L2-22: on failure, a short reason is returned and nothing is registered; Add can be pressed again", async () => {
    const fetchFn = (async () =>
      jsonResponse(502, {
        error: { message: "Missing key: header.title" },
      })) as unknown as typeof fetch;

    const outcome = await buildLanguagePack("ja", { fetchFn, origin });

    expect(outcome).toEqual({ ok: false, reason: "Missing key: header.title" });
    expect(hasLanguagePack("ja")).toBe(false);

    // Pressing Add again is just another call; nothing about it is blocked.
    const retry = await buildLanguagePack("ja", {
      fetchFn: (async () =>
        jsonResponse(200, {
          pack: { header: { title: "こんにちは" } },
        })) as unknown as typeof fetch,
      origin,
    });
    expect(retry).toEqual({ ok: true });
  });

  test("L2-22: a network failure also returns a short reason without throwing", async () => {
    const fetchFn = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    await expect(buildLanguagePack("ja", { fetchFn, origin })).resolves.toEqual(
      { ok: false, reason: expect.any(String) },
    );
  });
});

describe("Loading a saved language at startup (L2-23, L2-24)", () => {
  test("L2-23: a saved added language loads its cached pack and the page opens in it", async () => {
    const fetchFn = (async (url: string) => {
      expect(url).toBe("/api/locales/ko");
      return jsonResponse(200, { pack: { header: { title: "안녕" } } });
    }) as unknown as typeof fetch;

    const resolved = await resolveRuntimeLanguage("ko", { fetchFn });

    expect(resolved).toEqual({ language: "ko", available: true });
    expect(getTranslations("ko").header.title).toBe("안녕");
  });

  test("L2-24: a saved language whose cached file has been deleted opens in English and stays addable", async () => {
    const fetchFn = (async () =>
      jsonResponse(200, { pack: null })) as unknown as typeof fetch;

    const resolved = await resolveRuntimeLanguage("ko", { fetchFn });

    expect(resolved).toEqual({ language: "en", available: false });
    expect(hasLanguagePack("ko")).toBe(false);
  });

  test("L2-24: a 404 or network failure while loading also falls back to English", async () => {
    const notFound = (async () =>
      jsonResponse(404, {})) as unknown as typeof fetch;
    expect(await resolveRuntimeLanguage("ko", { fetchFn: notFound })).toEqual({
      language: "en",
      available: false,
    });

    const offline = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await resolveRuntimeLanguage("ko", { fetchFn: offline })).toEqual({
      language: "en",
      available: false,
    });
  });

  test("a built-in saved language never fetches anything", async () => {
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return jsonResponse(200, { pack: {} });
    }) as unknown as typeof fetch;

    const resolved = await resolveRuntimeLanguage("es", { fetchFn });

    expect(resolved).toEqual({ language: "es", available: true });
    expect(called).toBe(false);
  });
});

// Task L3 (docs/plans/2026-09-21-task-l3-rtl-layout-test-cases.md): the
// ZenJournal effect that sets `document.documentElement.lang`/`dir` derives
// direction purely from the resolved language with `directionFor`, so
// exercising the same pair proves the two can never fall out of step —
// there is no separate direction state to drift.
describe("Direction stays in step with the resolved language (L3-4 to L3-7)", () => {
  test("L3-4: choosing ar resolves to dir 'rtl' while keeping lang 'ar'", () => {
    expect({ language: "ar", direction: directionFor("ar") }).toEqual({
      language: "ar",
      direction: "rtl",
    });
  });

  test("L3-5: switching from ar back to zh-TW resolves to dir 'ltr'", () => {
    expect(directionFor("ar")).toBe("rtl");
    expect(directionFor("zh-TW")).toBe("ltr");
  });

  test("L3-6: a page load with ar saved and its pack cached resolves to dir 'rtl'", async () => {
    const fetchFn = (async () =>
      jsonResponse(200, {
        pack: { header: { title: "مرحبا" } },
      })) as unknown as typeof fetch;

    const resolved = await resolveRuntimeLanguage("ar", { fetchFn });

    expect(resolved).toEqual({ language: "ar", available: true });
    expect(directionFor(resolved.language)).toBe("rtl");
  });

  test("L3-7: a page load with ar saved but its cached pack gone falls back to English and to dir 'ltr'", async () => {
    const fetchFn = (async () =>
      jsonResponse(200, { pack: null })) as unknown as typeof fetch;

    const resolved = await resolveRuntimeLanguage("ar", { fetchFn });

    expect(resolved).toEqual({ language: "en", available: false });
    expect(directionFor(resolved.language)).toBe("ltr");
  });
});

describe("loadLanguagePack", () => {
  test("registers the pack and returns true when the server has one", async () => {
    const fetchFn = (async () =>
      jsonResponse(200, {
        pack: { header: { title: "こんにちは" } },
      })) as unknown as typeof fetch;
    expect(await loadLanguagePack("ja", { fetchFn })).toBe(true);
    expect(hasLanguagePack("ja")).toBe(true);
  });

  test("returns false and registers nothing when absent", async () => {
    const fetchFn = (async () =>
      jsonResponse(200, { pack: null })) as unknown as typeof fetch;
    expect(await loadLanguagePack("ja", { fetchFn })).toBe(false);
    expect(hasLanguagePack("ja")).toBe(false);
  });
});

// Task L4 (docs/plans/2026-09-21-task-l4-cached-languages-stay-added-test-cases.md).
describe("Switching into a cached-but-unloaded language (L4-6)", () => {
  test("L4-6: choosing a cached-but-unloaded language fetches its pack first, and only resolves once it has arrived", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchFn = (() =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })) as unknown as typeof fetch;

    const promise = ensureLanguageLoaded("ja", { fetchFn });
    // The pack has not arrived yet: the page must not switch into ja
    // while it is still English underneath.
    expect(hasLanguagePack("ja")).toBe(false);

    resolveFetch(
      jsonResponse(200, { pack: { header: { title: "こんにちは" } } }),
    );
    const outcome = await promise;

    expect(outcome).toEqual({ ok: true, language: "ja" });
    expect(hasLanguagePack("ja")).toBe(true);
  });

  test("L4-6: an already-loaded or built-in language resolves immediately without fetching", async () => {
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return jsonResponse(200, { pack: {} });
    }) as unknown as typeof fetch;

    expect(await ensureLanguageLoaded("es", { fetchFn })).toEqual({
      ok: true,
      language: "es",
    });
    expect(called).toBe(false);

    await buildLanguagePack("ja", {
      fetchFn: (async () =>
        jsonResponse(200, {
          pack: { header: { title: "こんにちは" } },
        })) as unknown as typeof fetch,
      origin,
    });
    called = false;
    expect(await ensureLanguageLoaded("ja", { fetchFn })).toEqual({
      ok: true,
      language: "ja",
    });
    expect(called).toBe(false);
  });

  test("L4-6: a cached code whose file turns out to be gone abandons the switch", async () => {
    const fetchFn = (async () =>
      jsonResponse(200, { pack: null })) as unknown as typeof fetch;

    expect(await ensureLanguageLoaded("ja", { fetchFn })).toEqual({
      ok: false,
    });
    expect(hasLanguagePack("ja")).toBe(false);
  });
});

describe("Loading the cached-language list at startup (L4-5, L4-8)", () => {
  test("L4-5: a successful list marks every returned code cached", async () => {
    const fetchFn = (async (url: string) => {
      expect(url).toBe("/api/locales");
      return jsonResponse(200, { codes: ["ar", "ja"] });
    }) as unknown as typeof fetch;

    await loadCachedLanguageList({ fetchFn });

    expect(hasCachedLanguagePack("ar")).toBe(true);
    expect(hasCachedLanguagePack("ja")).toBe(true);
    // Still not loaded into memory just from listing (L4-5 vs getTranslations).
    expect(hasLanguagePack("ar")).toBe(false);
  });

  test("L4-8: a failed list request leaves the cached set untouched and raises nothing", async () => {
    setCachedLanguages(["ja"]);
    const fetchFn = (async () =>
      jsonResponse(503, {})) as unknown as typeof fetch;

    await expect(loadCachedLanguageList({ fetchFn })).resolves.toBeUndefined();
    expect(hasCachedLanguagePack("ja")).toBe(true);
  });

  test("L4-8: a network failure while listing also resolves quietly", async () => {
    const fetchFn = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    await expect(loadCachedLanguageList({ fetchFn })).resolves.toBeUndefined();
    expect(hasCachedLanguagePack("ja")).toBe(false);
  });
});
