import { describe, expect, test } from "vitest";
import { validateLanguagePack } from "../../src/report/language-pack.js";
import { parseCandidateJson } from "../../src/summarizer/summary-run.js";
import { en } from "../../web/i18n.js";

/** A full, valid translation of English: every string suffixed with " (x)". */
function translate(value: unknown): unknown {
  if (typeof value === "string") return `${value} (x)`;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        translate(child),
      ]),
    );
  }
  return value;
}

function validPack(): Record<string, unknown> {
  return translate(en) as Record<string, unknown>;
}

describe("Language pack validation (L2-1 to L2-8)", () => {
  test("L2-1: every English key present with intact placeholders is accepted unchanged", () => {
    const pack = validPack();
    const result = validateLanguagePack(pack);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.meta.count).toBe("🎯 {n} achievements (x)");
      expect(result.pack.header.title).toBe("Daily Achievements (x)");
    }
  });

  test("L2-2: a pack missing one key is rejected, naming the missing key", () => {
    const pack = validPack() as { header: Record<string, unknown> };
    delete pack.header.title;
    const result = validateLanguagePack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("header.title");
  });

  test("L2-3: an extra key not in English is dropped, the rest accepted", () => {
    const pack = validPack() as Record<string, unknown>;
    (pack.header as Record<string, unknown>).extraNotInEnglish = "surprise";
    const result = validateLanguagePack(pack);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.header).not.toHaveProperty("extraNotInEnglish");
    }
  });

  test("L2-4: a string that dropped {n} is rejected, naming the key", () => {
    const pack = validPack() as { meta: Record<string, unknown> };
    pack.meta.count = "achievements today";
    const result = validateLanguagePack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("{n}");
      expect(result.reason).toContain("meta.count");
    }
  });

  test("L2-4: a string that dropped {date} is rejected, naming the key", () => {
    const pack = validPack() as { states: Record<string, unknown> };
    pack.states.emptyDateTitle = "No Report Found";
    const result = validateLanguagePack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("{date}");
      expect(result.reason).toContain("states.emptyDateTitle");
    }
  });

  test("L2-5: a string that reordered its placeholders is accepted", () => {
    const pack = validPack() as { activity: Record<string, unknown> };
    pack.activity.statusIncomplete =
      "{sessions} sessions · {issues} issues · incomplete: {reason}";
    const result = validateLanguagePack(pack);
    expect(result.ok).toBe(true);
  });

  test("L2-6: a value of the wrong type (number) is rejected", () => {
    const pack = validPack() as { meta: Record<string, unknown> };
    pack.meta.sources = 42;
    const result = validateLanguagePack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("meta.sources");
  });

  test("L2-6: a value of the wrong type (null) is rejected", () => {
    const pack = validPack() as { meta: Record<string, unknown> };
    pack.meta.sources = null;
    const result = validateLanguagePack(pack);
    expect(result.ok).toBe(false);
  });

  test("L2-6: a nested object where English has a string is rejected", () => {
    const pack = validPack() as { meta: Record<string, unknown> };
    pack.meta.sources = { nested: "oops" };
    const result = validateLanguagePack(pack);
    expect(result.ok).toBe(false);
  });

  test("L2-7: a reply wrapped in a code fence is parsed and judged on content, same as a summary reply", () => {
    const wrapped = `\`\`\`json\n${JSON.stringify(validPack())}\n\`\`\``;
    const result = validateLanguagePack(parseCandidateJson(wrapped));
    expect(result.ok).toBe(true);
  });

  test("L2-8: a reply that is not JSON at all is rejected with a short reason, no throw", () => {
    expect(() => {
      const result = validateLanguagePack(
        parseCandidateJson("not json at all"),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason.length).toBeLessThan(60);
      }
    }).not.toThrow();
  });
});
