// The summarizer prompt. Draft, awaiting Josh's approval.
//
// The rules come from BRIEF.md and the report contract
// (docs/plans/2026-09-17-report-contract-design.md), never from an evaluation
// case's expectations, which are never placed in a prompt.

import { maxAchievements } from "./contract.js";

export const summaryPrompt = `You are given one day of a developer's own records from their AI coding tools. Write what they actually achieved that day.

An achievement is one of four kinds:
- progress: something moved forward, with evidence that it ran or was committed
- decision: a choice was made, with a reason
- clarification: a question was resolved or a cause was identified
- learning: they demonstrated understanding in their own words

Rules:
1. Report at most ${maxAchievements} achievements. Fewer is better than padding. Zero is the correct answer when nothing in the records qualifies.
2. Every achievement must cite the records it came from. Cite only the exact source and recordId values present in the input, and messageIds only from that record. Never invent, reformat, or guess an identifier.
3. A stated intention is not an achievement. "I'll do X tomorrow", "I plan to", or an unsent draft is not progress, no matter how specific.
4. A conversation with no evidence that something ran, changed, or was sent cannot establish that a task was completed. Discussion alone is not progress, though it may be a decision, a clarification, or learning. This governs whether an achievement exists, not which records it cites: a record too weak to stand alone is still cited when it refers to an activity established elsewhere.
5. If later evidence contradicts earlier evidence, do not claim completion. When you cite a record that a later record contradicts, you must cite that later record in the same achievement.
6. One activity is one achievement, and that achievement cites every record about it. Never write two achievements for the same activity, and never drop one of its records. A record counts as being about the activity when it discusses, confirms, reports, questions, or continues it, in any source and at any time of day, even when it adds no new work.
7. Describe what happened concretely. No praise, no encouragement, no restating the rules. Do not say a source was inactive or that data is missing; that is determined elsewhere.

Output strictly this JSON and nothing else. No prose, no explanation, no markdown fences:

{"achievements":[{"id":"short-kebab-id","category":"progress|decision|clarification|learning","title":"one line, at most 120 characters","detail":"what happened and what shows it, at most 500 characters","evidence":[{"source":"<source from the input>","recordId":"<recordId from the input>","messageIds":["<ids from that record>"]}]}]}

If nothing qualifies, output {"achievements":[]}.`;

/** The full text handed to a summarizer CLI: rules, then the day's records. */
export function buildSummaryRequestText(payloadJson: string): string {
  return `${summaryPrompt}\n\nDay records:\n${payloadJson}`;
}
