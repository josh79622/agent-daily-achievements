// Pure mapping from a saved AchievementReportV1 to the constellation's node
// and status shapes. No DOM access here, so it is unit-testable directly in
// Node and is also the browser's real, single source of truth for this
// logic — `app.ts` imports it as an ordinary module (served as
// `/report-view.js`, see `staticAssetFor` in `src/server/app.ts`).
//
// Evidence is not turned into separate constellation nodes (still one
// achievement, one node), but each node now carries its evidence so
// app.ts can trace it back to the local record it came from.
import type {
  Achievement,
  EvidenceRef,
  IncompleteEntry,
  ReportSource,
} from "../src/report/contract.js";

export type NodeKind = "achievement" | "event" | "detail";

export interface ConstellationNode {
  id: string;
  parentId?: string;
  title: string;
  detail: string;
  kind: NodeKind;
  evidence: EvidenceRef[];
  x: number;
  y: number;
}

/**
 * Even, deterministic placement around an ellipse: the same achievement
 * count always renders the same layout, which keeps this testable and keeps
 * a re-render (after Expand/Related) stable. An organic, non-uniform scatter
 * is a later visual-polish task, not required to show real data.
 */
export function layoutPosition(
  index: number,
  count: number,
): { x: number; y: number } {
  if (count < 1 || index < 0 || index >= count)
    throw new RangeError("layoutPosition: index out of range for count.");
  if (count === 1) return { x: 50, y: 50 };
  const centerX = 50;
  const centerY = 52;
  const radiusX = 34;
  const radiusY = 30;
  const angle = (2 * Math.PI * index) / count - Math.PI / 2;
  return {
    x: round1(centerX + radiusX * Math.cos(angle)),
    y: round1(centerY + radiusY * Math.sin(angle)),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function mapAchievementsToNodes(
  achievements: readonly Achievement[],
): ConstellationNode[] {
  return achievements.map((achievement, index) => ({
    id: achievement.id,
    title: achievement.title,
    detail: achievement.detail,
    kind: "achievement",
    evidence: achievement.evidence,
    ...layoutPosition(index, achievements.length),
  }));
}

const sourceLabels: Record<ReportSource, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  antigravity: "Google Antigravity",
  "claude-web": "Claude (web)",
  "chatgpt-web": "ChatGPT (web)",
  "gemini-web": "Gemini (web)",
};

function sourceLabel(source: ReportSource): string {
  return sourceLabels[source] ?? source;
}

/** One line per incomplete reason, in the order the report lists them. */
export function describeIncomplete(
  entries: readonly IncompleteEntry[],
): string[] {
  return entries.map((entry) => {
    switch (entry.reason) {
      case "source-incomplete":
        return `${sourceLabel(entry.source)} data is incomplete.`;
      case "summary-unavailable":
        return "The summarizer did not produce a report.";
      case "summary-invalid":
        return "The summarizer's output could not be used.";
      case "summary-chunk-failed":
        return `One part of the day's summary could not be produced: ${entry.sessions
          .map(
            ({ source, recordId }) =>
              `${sourceLabel(source)} session ${recordId}`,
          )
          .join("; ")}.`;
      case "summary-merge-unavailable":
        return "The final summary merge did not produce a report.";
      case "summary-merge-invalid":
        return "The final summary merge output could not be used.";
      case "summary-merge-too-large":
        return "The final summary merge was too large to run.";
      case "summary-message-too-large":
        return "One source message was too large to summarize.";
    }
  });
}

export { sourceLabel };

/**
 * Only these sources have a local collector to trace back to; the optional
 * Chrome add-on (claude-web/chatgpt-web/gemini-web) does not exist yet, so
 * an evidence reference to one of those cannot be shown, only named.
 */
export function isLocallyTraceable(
  source: ReportSource,
): source is "claude-code" | "codex" | "antigravity" {
  return (
    source === "claude-code" || source === "codex" || source === "antigravity"
  );
}

export interface EvidenceMessage {
  id: string;
  role: string;
  text: string;
}

/**
 * Which of a fetched session's messages an evidence reference actually
 * points to, in the order the evidence listed them. Absent `messageIds`
 * means the reference is to the whole record. A listed id the session no
 * longer has (local history rotated or changed since the report was made)
 * is reported rather than silently dropped, so a stale citation is visible
 * instead of quietly looking like a clean match.
 */
export function pickEvidenceMessages(
  messages: readonly EvidenceMessage[],
  messageIds: readonly string[] | undefined,
): { found: EvidenceMessage[]; missingIds: string[] } {
  if (!messageIds) return { found: [...messages], missingIds: [] };
  const byId = new Map(messages.map((message) => [message.id, message]));
  const found: EvidenceMessage[] = [];
  const missingIds: string[] = [];
  for (const id of messageIds) {
    const message = byId.get(id);
    if (message) found.push(message);
    else missingIds.push(id);
  }
  return { found, missingIds };
}
