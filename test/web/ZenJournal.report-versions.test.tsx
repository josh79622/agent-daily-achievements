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
import type { AchievementReportV1 } from "../../src/report/contract.js";

const date = "2026-09-22";

function report(title: string): AchievementReportV1 {
  return {
    schemaVersion: 1,
    date,
    timezone: "Australia/Sydney",
    status: "complete",
    coverage: [{ source: "codex", state: "included" }],
    incomplete: [],
    achievements: [
      {
        id: "item-1",
        title,
        detail: `${title} detail`,
        category: "progress",
        evidence: [],
      },
    ],
  };
}

const newest = {
  id: "newest-version",
  generatedAt: "2026-09-21T11:30:00.000Z",
  report: report("最新版本內容"),
};
const older = {
  id: "older-version",
  generatedAt: "2026-09-21T09:15:00.000Z",
  report: report("較舊版本內容"),
};

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubVersionsApi() {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    if (path === `/api/reports/${date}/versions`) {
      return new Response(JSON.stringify({ versions: [older, newest] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (init?.method === "PATCH" || init?.method === "DELETE") {
      return new Response(JSON.stringify({ report: newest.report }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("", { status: 404 });
  });
}

describe("ZenJournal report versions", () => {
  test("shows every version for the selected date newest first with its generated time", async () => {
    vi.stubGlobal("fetch", stubVersionsApi());

    render(<ZenJournal />);

    const newestTitle = await screen.findByText(
      newest.report.achievements[0]!.title,
    );
    const olderTitle = screen.getByText(older.report.achievements[0]!.title);
    expect(newestTitle.compareDocumentPosition(olderTitle)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getAllByText(/Generated|產生於/)).toHaveLength(2);
    expect(screen.getAllByText(/2026/)).toHaveLength(2);
  });

  test("keeps saved report content in its original language after UI language changes", async () => {
    vi.stubGlobal("fetch", stubVersionsApi());

    render(<ZenJournal />);
    await screen.findByText(newest.report.achievements[0]!.title);

    fireEvent.click(screen.getByRole("button", { name: "切換語言" }));
    fireEvent.click(screen.getByRole("option", { name: /English/ }));

    expect(
      screen.getByText(newest.report.achievements[0]!.title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(older.report.achievements[0]!.title),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/Generated/)).toHaveLength(2);
    });
  });

  test("edits and deletes through the selected version route", async () => {
    const fetchMock = stubVersionsApi();
    vi.stubGlobal("fetch", fetchMock);

    render(<ZenJournal />);
    await screen.findByText(newest.report.achievements[0]!.title);

    fireEvent.click(screen.getAllByRole("button", { name: "編輯" })[1]!);
    fireEvent.click(screen.getAllByRole("button", { name: "儲存" })[0]!);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/reports/${date}/versions/${older.id}/achievements/item-1`,
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    fireEvent.click(screen.getAllByRole("button", { name: "刪除" })[0]!);
    fireEvent.click(
      document.querySelector<HTMLButtonElement>(
        ".remove-confirm-group .action-danger",
      )!,
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/reports/${date}/versions/${newest.id}/achievements/item-1`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
