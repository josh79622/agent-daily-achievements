// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ZenJournal } from "../../web/ZenJournal.js";
import { zhTW } from "../../web/locales/zh-TW.js";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ZenJournal header utility controls", () => {
  test("keeps activity, settings, and theme as localized icon-only actions", () => {
    render(<ZenJournal />);

    const activity = screen.getByRole("button", {
      name: zhTW.header.activity,
    });
    const settings = screen.getByRole("button", {
      name: zhTW.header.settings,
    });
    const theme = screen.getByRole("button", {
      name: zhTW.header.themeToggle,
    });

    for (const button of [activity, settings, theme]) {
      expect(button).toHaveClass("header-icon-button");
      expect(button).not.toHaveTextContent(button.getAttribute("aria-label")!);
    }
    expect(screen.getAllByRole("tooltip", { hidden: true })).toHaveLength(4);

    fireEvent.click(activity);
    expect(
      screen.getByRole("heading", { name: zhTW.activity.title }),
    ).toBeInTheDocument();
    fireEvent.click(document.querySelector(".modal-close-btn")!);

    fireEvent.click(settings);
    expect(
      screen.getByRole("heading", { name: zhTW.settings.title }),
    ).toBeInTheDocument();
    fireEvent.click(document.querySelector(".modal-close-btn")!);

    fireEvent.click(theme);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
