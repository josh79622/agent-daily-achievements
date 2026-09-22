// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { ZenJournal } from "../../web/ZenJournal.js";
import { zhTW } from "../../web/locales/zh-TW.js";
import { en } from "../../web/locales/en.js";
import type { AchievementReportV1 } from "../../src/report/contract.js";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function createIncompleteReport(
  overrides: Partial<AchievementReportV1> = {},
): AchievementReportV1 {
  return {
    schemaVersion: 1,
    date: "2026-09-21",
    timezone: "Australia/Sydney",
    status: "incomplete",
    achievements: [],
    coverage: [
      { source: "claude-code", state: "incomplete", reason: "unreadable" },
      { source: "codex", state: "included" },
    ],
    incomplete: [
      { reason: "source-incomplete", source: "claude-code" },
      { reason: "summary-unavailable" },
    ],
    ...overrides,
  };
}

describe("ZenJournal incomplete report handling", () => {
  test("renders localized incomplete callout and regenerate summary button in zh-TW", async () => {
    let generateCalled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        if (
          urlStr.includes("/api/reports/generate") &&
          init?.method === "POST"
        ) {
          generateCalled = true;
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (urlStr.includes("/api/reports/")) {
          return new Response(
            JSON.stringify({ report: createIncompleteReport() }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response("", { status: 404 });
      }),
    );

    render(<ZenJournal />);

    // Localized incomplete messages should appear in zh-TW
    await waitFor(() => {
      expect(
        screen.getByText("Claude Code 資料不完整。 摘要工具未產生報告。"),
      ).toBeInTheDocument();
    });

    // The regenerate button should appear below the callout
    const regenerateBtn = screen.getByRole("button", {
      name: `⚡ ${zhTW.states.regenerateReport}`,
    });
    expect(regenerateBtn).toBeInTheDocument();
    expect(regenerateBtn).not.toBeDisabled();

    // Clicking the regenerate button triggers generation
    fireEvent.click(regenerateBtn);
    expect(generateCalled).toBe(true);
  });

  test("renders localized incomplete callout and regenerate summary button in English", async () => {
    localStorage.setItem("daily_proof_language", "en");

    let generateCalled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        if (
          urlStr.includes("/api/reports/generate") &&
          init?.method === "POST"
        ) {
          generateCalled = true;
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (urlStr.includes("/api/reports/")) {
          return new Response(
            JSON.stringify({ report: createIncompleteReport() }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response("", { status: 404 });
      }),
    );

    render(<ZenJournal />);

    // Localized incomplete messages should appear in English
    await waitFor(() => {
      expect(
        screen.getByText(
          "Claude Code data is incomplete. The summarizer did not produce a report.",
        ),
      ).toBeInTheDocument();
    });

    const regenerateBtn = screen.getByRole("button", {
      name: `⚡ ${en.states.regenerateReport}`,
    });
    expect(regenerateBtn).toBeInTheDocument();
    expect(regenerateBtn).not.toBeDisabled();

    fireEvent.click(regenerateBtn);
    expect(generateCalled).toBe(true);
  });
});
