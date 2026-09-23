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

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ZenJournal permission error handling", () => {
  test("renders localized callout and open settings button on 403 permission error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/reports/generate")) {
          return new Response(
            JSON.stringify({
              error: {
                message: "Save external summarization permission first.",
              },
            }),
            {
              status: 403,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response("", { status: 404 });
      }),
    );

    render(<ZenJournal />);

    // Click generate button in empty state
    const generateBtn = await screen.findByRole("button", {
      name: /產生 .* 的摘要/,
    });
    fireEvent.click(generateBtn);

    // Callout with localized permission message should appear
    await waitFor(() => {
      expect(
        screen.getByText(zhTW.states.permissionRequired),
      ).toBeInTheDocument();
    });

    // The button with gear icon and openSettings text should appear
    const openSettingsBtn = screen.getByRole("button", {
      name: `⚙️ ${zhTW.states.openSettings}`,
    });
    expect(openSettingsBtn).toBeInTheDocument();

    // Clicking it opens the settings modal
    fireEvent.click(openSettingsBtn);
    expect(
      screen.getByRole("heading", { name: zhTW.settings.title }),
    ).toBeInTheDocument();
  });

  test("renders English permission callout when language is English", async () => {
    localStorage.setItem("daily_proof_language", "en");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/reports/generate")) {
          return new Response(
            JSON.stringify({
              error: {
                message: "Save external summarization permission first.",
              },
            }),
            {
              status: 403,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response("", { status: 404 });
      }),
    );

    render(<ZenJournal />);

    const generateBtn = await screen.findByRole("button", {
      name: /Generate Summary for/,
    });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(
        screen.getByText(en.states.permissionRequired),
      ).toBeInTheDocument();
    });

    const openSettingsBtn = screen.getByRole("button", {
      name: `⚙️ ${en.states.openSettings}`,
    });
    expect(openSettingsBtn).toBeInTheDocument();

    fireEvent.click(openSettingsBtn);
    expect(
      screen.getByRole("heading", { name: en.settings.title }),
    ).toBeInTheDocument();
  });

  test("renders standard error message on non-permission failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/reports/generate")) {
          return new Response(
            JSON.stringify({
              error: { message: "Internal server error connecting to CLI." },
            }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response("", { status: 404 });
      }),
    );

    render(<ZenJournal />);

    const generateBtn = await screen.findByRole("button", {
      name: /產生 .* 的摘要/,
    });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Internal server error connecting to CLI."),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText(zhTW.states.permissionRequired),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `⚙️ ${zhTW.states.openSettings}` }),
    ).not.toBeInTheDocument();
  });
});
