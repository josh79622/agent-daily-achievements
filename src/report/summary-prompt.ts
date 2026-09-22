// The summarizer prompt. Draft, awaiting Josh's approval.
//
// The rules come from BRIEF.md and the report contract
// (docs/plans/2026-09-17-report-contract-design.md), never from an evaluation
// case's expectations, which are never placed in a prompt.

import { maxAchievements } from "./contract.js";
import type { EvidenceManifest } from "./contract.js";
import { findLanguage } from "./languages.js";
import type { SummaryChunk } from "./summary-chunking.js";

type SummaryPromptOptions = { language?: string };

function getLanguageInstruction(language?: string): string {
  if (!language || language === "auto") {
    return "Write the title and detail in the primary language used by the developer in the input records (e.g., Traditional Chinese if records are in Traditional Chinese, English if in English). No praise, no encouragement, no restating the rules.";
  }
  // Only a code from the fixed catalog may reach the prompt; anything else
  // could carry instructions of its own.
  const info = findLanguage(language);
  if (!info) throw new Error(`Unsupported summary language: ${language}`);
  const name =
    info.english === info.native
      ? info.english
      : `${info.english} (${info.native})`;
  return `Write the title and detail strictly in ${name}. No praise, no encouragement, no restating the rules.`;
}

export function buildPromptText(language?: string): string {
  const languageInstruction = getLanguageInstruction(language);
  return `You are given one day of a developer's own records from their AI coding tools. Write what they actually achieved that day.

An achievement is one of four kinds:
- progress: something moved forward, with evidence that it ran or was committed
- decision: a choice was made, with a clear reason (including deciding NOT to do something or rejecting an unviable path after evaluation)
- clarification: a question was resolved or a root cause was identified
- learning: they demonstrated understanding of a new concept or technique in their own words

Rules:
1. Report 3 to 5 key achievements. Fewer is better than padding. Zero is the correct answer when nothing in the records qualifies. Never report more than ${maxAchievements}.
2. Readability & Cognitive Clarity:
   - title: A concise, punchy phrase or short sentence (strictly under 40 characters / 10 words). State what was achieved or decided plainly and directly (e.g. "定稿 Energetica 求職信", "排除 8 筆不合適職缺", "重構認證中介層"). DO NOT include commit hashes, raw file paths, or parenthetical notes in the title.
   - detail: 1 to 2 clean, natural sentences explaining the core outcome or reasoning. Write for the developer to review their own day with clarity and closure. Focus on the net outcome, not the chronological trial-and-error.
   - Strictly avoid audit-log language: DO NOT say "the user", "使用者", "git log shows", or narrate prompt back-and-forth.
   - DO NOT put raw file paths or commit hashes in the detail; evidence references belong strictly in the "evidence" array.
3. The "evidence" list holds every record about the activity, not only the records that prove it happened. A record that merely mentions, confirms, repeats, or asks about the activity proves nothing on its own and is listed anyway. Cite only the exact source and recordId values present in the input, and messageIds only from that record. Never invent, reformat, or guess an identifier.
4. A stated intention is not an achievement. "I'll do X tomorrow", "I plan to", or an unsent draft is not progress, no matter how specific.
5. A conversation with no evidence that something ran, changed, or was sent cannot establish that a task was completed. Discussion alone is not progress, though it may be a decision, a clarification, or learning. This governs whether an achievement exists, not which records it cites: a record too weak to stand alone is still cited when it refers to an activity established elsewhere.
6. If later evidence contradicts earlier evidence, do not claim completion. When you cite a record that a later record contradicts, you must cite that later record in the same achievement.
7. Work in two steps. First group the input records by activity: two records are one activity when they concern the same piece of work, even in different sources, at different times, or with very different detail. Then write at most one achievement per group and list that whole group in its evidence. A group can produce no achievement, but it can never produce two, and no record of a group that produces an achievement is left out of it.
8. Language: ${languageInstruction}
9. Key Milestone: Pick the single most significant or impactful achievement of the day and set "isPrimary": true. All other achievements must have "isPrimary": false. If there are no achievements, output empty array.

Output strictly this JSON and nothing else. No prose, no explanation, no markdown fences:

{"achievements":[{"id":"short-kebab-id","category":"progress|decision|clarification|learning","title":"short punchy title","detail":"1-2 clean sentences","isPrimary":true,"evidence":[{"source":"<source from the input>","recordId":"<recordId from the input>","messageIds":["<ids from that record>"]}] <- one entry per record about this activity, in every source; a record that only mentions or confirms it belongs here too}]}

If nothing qualifies, output {"achievements":[]}.

Last step before you output: take each achievement and read every input record again. If a record refers to that same work in any way, and it is not already in that achievement's evidence, add it. Then output the JSON.`;
}

export const summaryPrompt = buildPromptText();

/** The full text handed to a summarizer CLI: rules, then the day's records. */
export function buildSummaryRequestText(
  payloadJson: string,
  options?: SummaryPromptOptions,
): string {
  const prompt = options?.language
    ? buildPromptText(options.language)
    : summaryPrompt;
  return `${prompt}\n\nDay records:\n${payloadJson}`;
}

/** A bounded request for candidate activities from one approved day chunk. */
export function buildChunkSummaryRequestText(
  chunk: SummaryChunk,
  options?: SummaryPromptOptions,
): string {
  const prompt = options?.language
    ? buildPromptText(options.language)
    : summaryPrompt;
  return `${prompt}\n\nThis is one chunk of the day's records. Identify qualifying activities from these records only. Cite only the evidence IDs in this chunk; do not cite records or messages outside it.\n\nChunk evidence manifest:\n${JSON.stringify(chunk.manifest)}\n\nChunk day records:\n${chunk.payloadJson}`;
}

/** Combines validated chunk candidates into one final evidence-traceable day. */
export function buildMergeSummaryRequestText(
  chunkCandidates: readonly unknown[],
  manifest: EvidenceManifest,
  options?: SummaryPromptOptions,
): string {
  const prompt = options?.language
    ? buildPromptText(options.language)
    : summaryPrompt;
  return `${prompt}\n\nMerge the chunk candidates below into 0 to 5 deduplicated final achievements for the day. This merge-specific limit overrides the usual minimum: zero is allowed. Cite only original evidence IDs from the supplied manifest. Never cite chunk IDs or invented IDs. Combine duplicate activities into one achievement and retain all applicable original evidence.\n\nSerialized chunk candidates:\n${JSON.stringify(chunkCandidates)}\n\nFull original day evidence manifest:\n${JSON.stringify(manifest)}`;
}
