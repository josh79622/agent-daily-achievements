// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { EvidenceModal } from "../../web/EvidenceModal.js";
import { ZenJournal } from "../../web/ZenJournal.js";
import { zhTW } from "../../web/locales/zh-TW.js";
import { en } from "../../web/locales/en.js";
import type {
  Achievement,
  AchievementReportV1,
} from "../../src/report/contract.js";
import { getYesterdayDate } from "../../web/date-utils.js";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sampleAchievement: Achievement = {
  id: "ach-1",
  title: "Landing Page Redesign",
  detail: "Refactored user dashboard and streamlined evidence preview.",
  category: "progress",
  project: "dashboard-v2",
  isPrimary: true,
  evidence: [
    {
      source: "codex",
      recordId: "session-001",
      messageIds: ["m1", "m2"],
    },
    {
      source: "claude-code",
      recordId: "session-002",
      messageIds: ["m3"],
    },
  ],
};

describe("EvidenceModal component", () => {
  test("does not render when isOpen is false", () => {
    const { container } = render(
      <EvidenceModal
        isOpen={false}
        onClose={vi.fn()}
        achievement={sampleAchievement}
        t={zhTW}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders modal elements when isOpen is true", () => {
    render(
      <EvidenceModal
        isOpen={true}
        onClose={vi.fn()}
        achievement={sampleAchievement}
        t={zhTW}
      />,
    );

    // Header & details
    expect(screen.getByText("🌟 核心里程碑")).toBeTruthy();
    expect(screen.getByText("Landing Page Redesign")).toBeTruthy();
    expect(screen.getByText("dashboard-v2")).toBeTruthy();
    expect(
      screen.getByText(
        "Refactored user dashboard and streamlined evidence preview.",
      ),
    ).toBeTruthy();

    // Section 1 header with count
    expect(screen.getByText("📎 紀錄佐證 (2)")).toBeTruthy();

    // Both evidence pill buttons are rendered inside pills container
    const pills = screen.getAllByRole("button", { name: /📎/ });
    expect(pills).toHaveLength(2);
    expect(pills[0]?.classList.contains("active")).toBe(true);
    expect(pills[1]?.classList.contains("active")).toBe(false);

    // Switching active pill
    fireEvent.click(pills[1]!);
    expect(pills[0]?.classList.contains("active")).toBe(false);
    expect(pills[1]?.classList.contains("active")).toBe(true);
  });

  test("calls onClose when close button, backdrop, or Escape key is triggered", () => {
    const onClose = vi.fn();
    render(
      <EvidenceModal
        isOpen={true}
        onClose={onClose}
        achievement={sampleAchievement}
        t={zhTW}
      />,
    );

    // Close button
    const closeBtn = screen.getByRole("button", { name: /關閉|Close|✕/ });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Escape key
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);

    // Backdrop click
    const backdrop = document.querySelector(".modal-backdrop")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);

    // Dialog inside click does NOT close modal
    const dialog = document.querySelector(".evidence-modal")!;
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  test("renders English strings when en translation is passed", () => {
    render(
      <EvidenceModal
        isOpen={true}
        onClose={vi.fn()}
        achievement={sampleAchievement}
        t={en}
      />,
    );

    expect(screen.getByText("🌟 Key Milestone")).toBeTruthy();
    expect(screen.getByText("📎 Evidence Records (2)")).toBeTruthy();
  });
});

describe("ZenJournal card evidence interaction", () => {
  const date = getYesterdayDate();

  function stubVersionsApi(achievement: Achievement) {
    const reportData: AchievementReportV1 = {
      schemaVersion: 1,
      date,
      timezone: "Australia/Sydney",
      status: "complete",
      coverage: [{ source: "codex", state: "included" }],
      incomplete: [],
      achievements: [achievement],
    };
    const version = {
      id: "v1",
      generatedAt: "2026-09-23T10:00:00.000Z",
      report: reportData,
    };
    return vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      if (path === `/api/reports/${date}/versions`) {
        return new Response(JSON.stringify({ versions: [version] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("", { status: 404 });
    });
  }

  test("shows compact evidence summary button and opens modal on card or button click", async () => {
    vi.stubGlobal("fetch", stubVersionsApi(sampleAchievement));

    render(<ZenJournal />);
    await screen.findByText(sampleAchievement.title);

    // Card has is-clickable class
    const card = document.querySelector(".journal-card.is-clickable");
    expect(card).toBeTruthy();

    // Shows compact summary button with count and viewEvidence text
    const summaryBtn = screen.getByRole("button", {
      name: /2 條紀錄佐證 · 查看紀錄佐證 ↗/,
    });
    expect(summaryBtn).toBeTruthy();

    // Modal is initially not present
    expect(document.querySelector(".evidence-modal")).toBeNull();

    // Clicking summary button opens EvidenceModal
    fireEvent.click(summaryBtn);
    expect(document.querySelector(".evidence-modal")).toBeTruthy();
    expect(screen.getByText("📎 紀錄佐證 (2)")).toBeTruthy();

    // Close modal
    fireEvent.click(screen.getByRole("button", { name: /關閉|Close|✕/ }));
    await waitFor(() => {
      expect(document.querySelector(".evidence-modal")).toBeNull();
    });

    // Clicking the card itself also opens EvidenceModal
    fireEvent.click(card!);
    expect(document.querySelector(".evidence-modal")).toBeTruthy();
  });

  test("clicking edit or delete button does not open the EvidenceModal", async () => {
    vi.stubGlobal("fetch", stubVersionsApi(sampleAchievement));

    render(<ZenJournal />);
    await screen.findByText(sampleAchievement.title);

    const editBtn = screen.getByRole("button", { name: "編輯" });
    fireEvent.click(editBtn);

    // Enters edit mode, edit form is visible, modal is NOT opened
    expect(document.querySelector(".journal-edit-form")).toBeTruthy();
    expect(document.querySelector(".evidence-modal")).toBeNull();

    // Cancel edit
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(document.querySelector(".journal-edit-form")).toBeNull();
    expect(document.querySelector(".evidence-modal")).toBeNull();

    // Click delete button
    const deleteBtn = screen.getByRole("button", { name: "刪除" });
    fireEvent.click(deleteBtn);

    // Delete confirmation prompt is visible, modal is NOT opened
    expect(screen.getByText("確定刪除？")).toBeTruthy();
    expect(document.querySelector(".evidence-modal")).toBeNull();
  });

  test("card without evidence does not have is-clickable class or summary button", async () => {
    const noEvidenceAchievement: Achievement = {
      id: "ach-no-ev",
      title: "No Evidence Item",
      detail: "Completed without cited sessions.",
      category: "decision",
      evidence: [],
    };
    vi.stubGlobal("fetch", stubVersionsApi(noEvidenceAchievement));

    render(<ZenJournal />);
    await screen.findByText(noEvidenceAchievement.title);

    const card = document.querySelector(".journal-card");
    expect(card).toBeTruthy();
    expect(card?.classList.contains("is-clickable")).toBe(false);
    expect(document.querySelector(".card-evidence-summary")).toBeNull();

    // Clicking card does nothing
    fireEvent.click(card!);
    expect(document.querySelector(".evidence-modal")).toBeNull();
  });
});
