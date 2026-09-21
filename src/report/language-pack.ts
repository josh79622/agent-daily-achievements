// Validation for a language pack a summarizer CLI claims is a translation of
// the English UI strings. Design and test cases:
// docs/plans/2026-09-21-task-l2-on-demand-language-packs-test-cases.md
//
// The whole pack is accepted or rejected together (assumption 5): a missing
// key, a wrong value type, or a lost `{placeholder}` rejects everything, but
// an extra key the candidate invented is simply dropped.

import { en, placeholdersOf, type Translations } from "../../web/i18n.js";

export type LanguagePackValidation =
  { ok: true; pack: Translations } | { ok: false; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Walks the reference (English) shape and the candidate in lockstep,
 * building a pack that has exactly the reference's keys. Any problem is
 * reported with the dotted path of the offending key.
 */
function validateNode(
  reference: unknown,
  candidate: unknown,
  path: string,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (typeof reference === "string") {
    if (candidate === undefined) {
      return { ok: false, reason: `Missing key: ${path}` };
    }
    if (typeof candidate !== "string") {
      return { ok: false, reason: `Wrong value type for key: ${path}` };
    }
    const wanted = placeholdersOf(reference);
    const got = new Set(placeholdersOf(candidate));
    const lost = wanted.filter((name) => !got.has(name));
    if (lost.length > 0) {
      return {
        ok: false,
        reason: `Lost placeholder {${lost[0]}} in key: ${path}`,
      };
    }
    return { ok: true, value: candidate };
  }

  // A nested section of the pack.
  if (!isPlainObject(candidate)) {
    return { ok: false, reason: `Wrong value type for key: ${path}` };
  }
  const result: Record<string, unknown> = {};
  for (const [key, referenceValue] of Object.entries(
    reference as Record<string, unknown>,
  )) {
    const childPath = path ? `${path}.${key}` : key;
    const outcome = validateNode(referenceValue, candidate[key], childPath);
    if (!outcome.ok) return outcome;
    result[key] = outcome.value;
  }
  return { ok: true, value: result };
}

/**
 * Validates a provider's reply candidate against the English pack's shape.
 * `candidate` is whatever `parseCandidateJson` (src/summarizer/summary-run.ts)
 * extracted from the reply text, including its `{ __unparseable: true }`
 * marker for a reply that was not JSON at all.
 */
export function validateLanguagePack(
  candidate: unknown,
): LanguagePackValidation {
  if (
    isPlainObject(candidate) &&
    candidate.__unparseable === true &&
    Object.keys(candidate).length === 1
  ) {
    return { ok: false, reason: "The reply was not valid JSON." };
  }
  if (!isPlainObject(candidate)) {
    return { ok: false, reason: "The reply was not a JSON object." };
  }
  const outcome = validateNode(en, candidate, "");
  if (!outcome.ok) return outcome;
  return { ok: true, pack: outcome.value as Translations };
}
