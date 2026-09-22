// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SettingsModal } from "../../web/SettingsModal.js";
import { en } from "../../web/locales/en.js";
import { zhTW } from "../../web/locales/zh-TW.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockFetchWithProviders(
  providers: Array<{
    provider: "agy" | "claude-code" | "codex";
    state:
      | "ready"
      | "not-installed"
      | "sign-in-required"
      | "login-in-progress"
      | "probe-failed";
    signedIn?: true;
    installUrl?: string;
  }>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      if (input === "/api/installer/status") {
        return Promise.resolve(
          jsonResponse({
            installation: { status: "complete" },
            providerConnection: { state: "configured" },
          }),
        );
      }
      if (input === "/api/summarizer/providers") {
        return Promise.resolve(
          jsonResponse({
            providers: providers.map((p) => ({
              provider: p.provider,
              label: p.provider,
              state: p.state,
              installUrl: p.installUrl || "https://example.test/install",
              signedIn: p.signedIn,
            })),
          }),
        );
      }
      if (input === "/api/summarizer/models") {
        return Promise.resolve(jsonResponse({ providers: [] }));
      }
      if (input === "/api/summarizer/permission") {
        return Promise.resolve(jsonResponse({ permission: null }));
      }
      throw new Error(`Unexpected request: ${input}`);
    }),
  );
}

function jsonResponse(value: unknown) {
  return { ok: true, json: async () => value };
}

test("hides login button when provider is signedIn or ready, shows only when unauthenticated", async () => {
  mockFetchWithProviders([
    { provider: "agy", state: "ready", signedIn: true },
    { provider: "claude-code", state: "probe-failed", signedIn: true },
    { provider: "codex", state: "sign-in-required" },
  ]);

  render(
    <SettingsModal
      isOpen
      onClose={vi.fn()}
      language="en"
      t={en}
      onReportGenerated={vi.fn()}
    />,
  );

  // Ready provider displays green Ready pill
  expect(
    await screen.findByText(`🟢 ${en.settings.statusReady}`),
  ).toBeInTheDocument();
  // Signed-in provider (not ready) displays blue Signed in pill
  expect(
    screen.getByText(`🔵 ${en.settings.statusSignedIn}`),
  ).toBeInTheDocument();
  // Sign-in-required provider displays yellow Sign-in required pill
  expect(
    screen.getByText(`🟡 ${en.settings.statusSignInRequired}`),
  ).toBeInTheDocument();

  // Sign in button should ONLY be rendered for codex (sign-in-required), not agy (ready) or claude-code (signedIn)
  const signInButtons = screen.getAllByRole("button", {
    name: en.settings.signInProvider,
  });
  expect(signInButtons).toHaveLength(1);
});

test("displays localized status pills in zh-TW", async () => {
  mockFetchWithProviders([
    { provider: "agy", state: "ready" },
    { provider: "claude-code", state: "login-in-progress" },
    { provider: "codex", state: "not-installed" },
  ]);

  render(
    <SettingsModal
      isOpen
      onClose={vi.fn()}
      language="zh-TW"
      t={zhTW}
      onReportGenerated={vi.fn()}
    />,
  );

  expect(
    await screen.findByText(`🟢 ${zhTW.settings.statusReady}`),
  ).toBeInTheDocument();
  expect(
    screen.getByText(`🟡 ${zhTW.settings.statusLoginInProgress}`),
  ).toBeInTheDocument();
  expect(
    screen.getByText(`⚪️ ${zhTW.settings.statusNotInstalled}`),
  ).toBeInTheDocument();

  // Login in progress has sign in button; not-installed does not; ready does not.
  const signInButtons = screen.getAllByRole("button", {
    name: zhTW.settings.signInProvider,
  });
  expect(signInButtons).toHaveLength(1);
});

test("displays probe-failed pill when not signed in", async () => {
  mockFetchWithProviders([
    { provider: "agy", state: "probe-failed" },
    { provider: "claude-code", state: "not-installed" },
    { provider: "codex", state: "not-installed" },
  ]);

  render(
    <SettingsModal
      isOpen
      onClose={vi.fn()}
      language="en"
      t={en}
      onReportGenerated={vi.fn()}
    />,
  );

  expect(await screen.findByText("🔴 Check failed")).toBeInTheDocument();
  const signInButtons = screen.getAllByRole("button", {
    name: en.settings.signInProvider,
  });
  expect(signInButtons).toHaveLength(1);
});
