import { describe, expect, test } from "vitest";
import { buildLanguagePackPrompt } from "../../src/report/language-pack-prompt.js";
import { en } from "../../web/i18n.js";

describe("Language pack prompt (L2-18)", () => {
  test("L2-18: contains the English pack and the catalog's English name for the target language", () => {
    const prompt = buildLanguagePackPrompt("ja");
    expect(prompt).toContain("Japanese");
    expect(prompt).toContain(JSON.stringify(en));
  });

  test("L2-18: names both the English and native form when they differ", () => {
    const prompt = buildLanguagePackPrompt("fr");
    expect(prompt).toContain("French (Français)");
  });

  test("L2-18: carries no conversation content, only the fixed instructions and the English pack", () => {
    const prompt = buildLanguagePackPrompt("de");
    const withoutPack = prompt.replace(JSON.stringify(en), "");
    expect(withoutPack).not.toMatch(/achievement|conversation|session/i);
  });

  test("an unsupported code throws rather than reaching a provider", () => {
    expect(() => buildLanguagePackPrompt("xx")).toThrow();
  });
});
