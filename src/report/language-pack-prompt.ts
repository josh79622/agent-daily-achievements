// The prompt sent to a summarizer CLI to translate the English UI pack into
// one addable language (Task L2). Only the English pack and the catalog's
// English name for the target language are sent — no conversation content
// (assumption 2, test L2-18).

import { en } from "../../web/i18n.js";
import { findLanguage } from "./languages.js";

export function buildLanguagePackPrompt(languageCode: string): string {
  const info = findLanguage(languageCode);
  if (!info) throw new Error(`Unsupported language: ${languageCode}`);
  const name =
    info.english === info.native
      ? info.english
      : `${info.english} (${info.native})`;

  return `You are translating the user-interface text of a small local desktop app from English into ${name}.

Rules:
1. Translate every string value. Keep the exact same JSON structure, the same keys, and the same nesting as the English source below.
2. Any placeholder written as {name} (for example {date}, {n}) must appear in your translation exactly as written, character for character. You may move a placeholder to a more natural position in the sentence, but never rename, remove, or duplicate it.
3. Keep any leading emoji exactly as in the English source.
4. Write in a natural, concise tone suited to a small app's interface, not a formal document.
5. Do not add, rename, or remove any key.

Output strictly the translated JSON object and nothing else: no prose, no explanation, no markdown fences.

English source:
${JSON.stringify(en)}`;
}
