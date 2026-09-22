// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SettingsModal } from "../../web/SettingsModal.js";
import { en } from "../../web/i18n.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a completed installation with no provider shows safe connection guidance", async () => {
  const secret = "raw command output and SECRET_ENV_VALUE";
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      if (input === "/api/installer/status")
        return Promise.resolve(
          jsonResponse({
            installation: { status: "complete" },
            providerConnection: { state: "not-connected", detail: secret },
          }),
        );
      if (input === "/api/summarizer/providers")
        return Promise.resolve(
          jsonResponse({
            providers: ["agy", "claude-code", "codex"].map((provider) => ({
              provider,
              label: provider,
              state: "not-installed",
              installUrl: "https://example.test/install",
              reason: secret,
            })),
          }),
        );
      if (input === "/api/summarizer/models")
        return Promise.resolve(jsonResponse({ providers: [] }));
      if (input === "/api/summarizer/permission")
        return Promise.resolve(jsonResponse({ permission: null }));
      throw new Error(`Unexpected request: ${input}`);
    }),
  );

  render(
    <SettingsModal
      isOpen
      onClose={vi.fn()}
      language="en"
      t={en}
      onReportGenerated={vi.fn()}
    />,
  );

  expect(
    await screen.findByText(en.settings.noSummarizerConnected),
  ).toBeInTheDocument();
  expect(screen.getAllByText(en.settings.installProvider)).toHaveLength(3);
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
  expect(screen.queryByText(/installation failed/i)).toBeNull();
});

function jsonResponse(value: unknown) {
  return { ok: true, json: async () => value };
}
