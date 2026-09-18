import { expect, test } from "vitest";

import type {
  Achievement,
  IncompleteEntry,
} from "../../src/report/contract.js";
import {
  describeIncomplete,
  layoutPosition,
  mapAchievementsToNodes,
} from "../../web/report-view.js";

// Test cases RV-1 to RV-3. Pure logic only — no DOM. The rendering these
// feed (createNode/renderConstellation in web/app.ts) is verified manually
// in the browser pane, matching this project's existing convention for the
// non-testable DOM layer.

function achievement(
  id: string,
  overrides: Partial<Achievement> = {},
): Achievement {
  return {
    id,
    category: "progress",
    title: `Title ${id}`,
    detail: `Detail ${id}`,
    evidence: [{ source: "codex", recordId: "r1" }],
    ...overrides,
  };
}

test("RV-1: layoutPosition stays in bounds and gives every index a distinct point", () => {
  for (const count of [1, 2, 3, 4, 5]) {
    const points = Array.from({ length: count }, (_, index) =>
      layoutPosition(index, count),
    );
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(100);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(100);
    }
    const distinct = new Set(points.map((p) => `${p.x},${p.y}`));
    expect(distinct.size).toBe(count);
  }
  expect(layoutPosition(0, 1)).toEqual({ x: 50, y: 50 });
});

test("RV-1b: layoutPosition rejects an index outside the count", () => {
  expect(() => layoutPosition(-1, 3)).toThrow(RangeError);
  expect(() => layoutPosition(3, 3)).toThrow(RangeError);
  expect(() => layoutPosition(0, 0)).toThrow(RangeError);
});

test("RV-2: mapAchievementsToNodes preserves id/title/detail with no parent", () => {
  expect(mapAchievementsToNodes([])).toEqual([]);

  const achievements = [
    achievement("a1"),
    achievement("a2"),
    achievement("a3"),
  ];
  const nodes = mapAchievementsToNodes(achievements);

  expect(nodes).toHaveLength(3);
  for (const [index, node] of nodes.entries()) {
    expect(node.id).toBe(achievements[index]!.id);
    expect(node.title).toBe(achievements[index]!.title);
    expect(node.detail).toBe(achievements[index]!.detail);
    expect(node.kind).toBe("achievement");
    expect(node.parentId).toBeUndefined();
  }
  // Positions match layoutPosition for the same index/count.
  expect(nodes[1]).toMatchObject(layoutPosition(1, 3));
});

test("RV-3: describeIncomplete produces one friendly line per reason", () => {
  expect(describeIncomplete([])).toEqual([]);

  const entries: IncompleteEntry[] = [
    { reason: "source-incomplete", source: "claude-code" },
    { reason: "source-incomplete", source: "codex" },
    { reason: "summary-unavailable" },
    { reason: "summary-invalid", issue: "too-many-achievements" },
  ];

  expect(describeIncomplete(entries)).toEqual([
    "Claude Code data is incomplete.",
    "Codex data is incomplete.",
    "The summarizer did not produce a report.",
    "The summarizer's output could not be used.",
  ]);
});
