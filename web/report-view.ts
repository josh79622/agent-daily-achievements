// Pure mapping from a saved AchievementReportV1 to the constellation's node
// and status shapes. No DOM access here, so it is unit-testable directly in
// Node and is also the browser's real, single source of truth for this
// logic — `app.ts` imports it as an ordinary module (served as
// `/report-view.js`, see `staticAssetFor` in `src/server/app.ts`).
//
// Evidence is not yet turned into its own nodes; that is the separate
// "source trace-back" task. For now one achievement is one node, with no
// children, and the layout only has to place the achievement tier.
import type {
  Achievement,
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
    ...layoutPosition(index, achievements.length),
  }));
}

const sourceLabels: Record<ReportSource, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
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
    }
  });
}
