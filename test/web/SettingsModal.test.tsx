// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";

import { SettingsModal } from "../../web/SettingsModal.js";
import { getTranslations } from "../../web/i18n.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const t = getTranslations("zh-TW");

function mockSettingsResponses() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ providers: [] }) })),
  );
}

function renderModal(initialDate = "2026-09-18") {
  function Harness() {
    const [selectedDate, setSelectedDate] = useState(initialDate);
    return (
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        language="zh-TW"
        t={t}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        onReportGenerated={vi.fn()}
      />
    );
  }

  render(<Harness />);
}

describe("Settings modal report date", () => {
  test("shows the shared date selector and submits its changed date", async () => {
    mockSettingsResponses();
    renderModal();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "重新產生摘要" }),
      ).toBeEnabled(),
    );

    const dateControl = screen.getByLabelText(t.header.selectDate);
    expect(dateControl).toHaveValue("2026-09-18");

    fireEvent.change(dateControl, { target: { value: "2026-09-17" } });
    expect(dateControl).toHaveValue("2026-09-17");

    fireEvent.click(screen.getByRole("button", { name: "重新產生摘要" }));

    expect(fetch).toHaveBeenLastCalledWith("/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduled: false,
        language: "zh-TW",
        date: "2026-09-17",
      }),
    });
  });

  test("uses the fixed regenerate-summary label", () => {
    mockSettingsResponses();
    renderModal();

    expect(
      screen.getByRole("button", { name: "重新產生摘要" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /2026-09-18/ }),
    ).not.toBeInTheDocument();
  });
});
