import { describe, expect, test } from "vitest";
import {
  computeSourceCoverageList,
  formatSourceCoverageText,
  formatSessionTimeRange,
  type CollectorSourceStatus,
} from "../../web/local-activity-view.js";
import { translations } from "../../web/i18n.js";

const tEn = translations.en;
const tZh = translations["zh-TW"];

describe("Local Activity View Helpers (LA-1 to LA-8)", () => {
  test("LA-1 & LA-4: computeSourceCoverageList handles authorized and unauthorized sources", () => {
    const savedSources = ["claude-code", "antigravity"];
    const reportedSources: CollectorSourceStatus[] = [
      {
        source: "claude-code",
        sessions: 3,
        issues: 0,
        state: "available",
      },
      {
        source: "antigravity",
        sessions: 5,
        issues: 1,
        state: "incomplete",
        reason: "malformed-record",
      },
    ];

    const result = computeSourceCoverageList(savedSources, reportedSources);

    // Should include all 3 known local sources
    expect(result).toHaveLength(3);

    const claude = result.find((s) => s.source === "claude-code")!;
    expect(claude.state).toBe("available");
    expect(claude.sessions).toBe(3);

    const antigravity = result.find((s) => s.source === "antigravity")!;
    expect(antigravity.state).toBe("incomplete");
    expect(antigravity.issues).toBe(1);
    expect(antigravity.reason).toBe("malformed-record");

    const codex = result.find((s) => s.source === "codex")!;
    expect(codex.state).toBe("not-authorized");
    expect(codex.sessions).toBe(0);
  });

  test("LA-2: computeSourceCoverageList marks all sources unauthorized when consent is empty", () => {
    const savedSources: string[] = [];
    const reportedSources: CollectorSourceStatus[] = [];

    const result = computeSourceCoverageList(savedSources, reportedSources);
    expect(result).toHaveLength(3);
    for (const source of result) {
      expect(source.state).toBe("not-authorized");
    }
  });

  test("LA-4: formatSourceCoverageText formats each status correctly in English", () => {
    expect(
      formatSourceCoverageText(
        { source: "codex", sessions: 0, issues: 0, state: "not-authorized" },
        tEn,
      ),
    ).toBe("Codex · not authorized");

    expect(
      formatSourceCoverageText(
        {
          source: "claude-code",
          sessions: 0,
          issues: 0,
          state: "not-installed",
        },
        tEn,
      ),
    ).toBe("Claude Code · not installed");

    expect(
      formatSourceCoverageText(
        { source: "antigravity", sessions: 0, issues: 0, state: "no-activity" },
        tEn,
      ),
    ).toBe("Google Antigravity · no activity");

    expect(
      formatSourceCoverageText(
        { source: "claude-code", sessions: 4, issues: 0, state: "available" },
        tEn,
      ),
    ).toBe("Claude Code · 4 sessions · available");

    expect(
      formatSourceCoverageText(
        {
          source: "codex",
          sessions: 2,
          issues: 3,
          state: "incomplete",
          reason: "unreadable file",
        },
        tEn,
      ),
    ).toBe("Codex · incomplete: unreadable file · 2 sessions · 3 issues");
  });

  test("LA-4 (zh): formatSourceCoverageText formats each status correctly in Traditional Chinese", () => {
    expect(
      formatSourceCoverageText(
        { source: "codex", sessions: 0, issues: 0, state: "not-authorized" },
        tZh,
      ),
    ).toBe("Codex · 未授權");

    expect(
      formatSourceCoverageText(
        {
          source: "claude-code",
          sessions: 0,
          issues: 0,
          state: "not-installed",
        },
        tZh,
      ),
    ).toBe("Claude Code · 未安裝");

    expect(
      formatSourceCoverageText(
        { source: "antigravity", sessions: 0, issues: 0, state: "no-activity" },
        tZh,
      ),
    ).toBe("Google Antigravity · 無活動");

    expect(
      formatSourceCoverageText(
        { source: "antigravity", sessions: 5, issues: 0, state: "available" },
        tZh,
      ),
    ).toBe("Google Antigravity · 5 個會話 · 可用");
  });

  test("LA-5: formatSessionTimeRange formats ISO timestamp pairs safely", () => {
    const range = formatSessionTimeRange(
      "2026-09-18T10:15:00.000Z",
      "2026-09-18T11:45:00.000Z",
    );
    expect(range).toMatch(/\d{1,2}:\d{2}/);
  });

  test("LA-5: formatSessionTimeRange handles missing or identical timestamps", () => {
    expect(formatSessionTimeRange("", "")).toBe("—");
    const single = formatSessionTimeRange(
      "2026-09-18T10:15:00.000Z",
      "2026-09-18T10:15:00.000Z",
    );
    expect(single).toBeTruthy();
  });
});
