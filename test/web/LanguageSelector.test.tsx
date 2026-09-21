// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import { LanguageSelector } from "../../web/LanguageSelector.js";
import { en, markLanguageCached, setCachedLanguages } from "../../web/i18n.js";

// Task 5 (docs/plans/2026-09-21-task-5-component-tests-test-cases.md),
// cases T5-1 to T5-10. web/LanguageSelector.tsx calls buildLanguagePack
// (web/language-runtime.ts) on its own, which reaches global fetch; that
// boundary is stubbed here so no test touches the network or a real
// provider.
const buildLanguagePackMock = vi.fn();
vi.mock("../../web/language-runtime.js", () => ({
  buildLanguagePack: (...args: unknown[]) => buildLanguagePackMock(...args),
}));

// "ja" and "ko" are catalog codes that are neither built in nor cached
// unless a test says so with setCachedLanguages/markLanguageCached below.
const added = "ko";
const builtIn = "es";

afterEach(() => {
  cleanup();
  setCachedLanguages([]);
  buildLanguagePackMock.mockReset();
});

function renderSelector(onLanguageChange = vi.fn()) {
  render(
    <LanguageSelector
      language="en"
      onLanguageChange={onLanguageChange}
      t={en}
    />,
  );
  return { onLanguageChange };
}

function openDropdown() {
  fireEvent.click(
    screen.getByRole("button", { name: en.header.languageToggle }),
  );
}

describe("Opening and searching the dropdown (T5-1 to T5-3)", () => {
  test("T5-1: clicking the language button reveals the search box and the language list", () => {
    renderSelector();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    openDropdown();

    expect(
      screen.getByPlaceholderText(en.header.languageSearchPlaceholder),
    ).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  test('T5-2: typing "espanol" lists only Spanish', () => {
    renderSelector();
    openDropdown();

    fireEvent.change(
      screen.getByPlaceholderText(en.header.languageSearchPlaceholder),
      { target: { value: "espanol" } },
    );

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Spanish");
  });

  test("T5-3: a search matching nothing shows the 'no results' line", () => {
    renderSelector();
    openDropdown();

    fireEvent.change(
      screen.getByPlaceholderText(en.header.languageSearchPlaceholder),
      { target: { value: "zzzzzz" } },
    );

    expect(screen.getByText(en.header.languageNoResults)).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});

describe("Choosing a language (T5-4)", () => {
  test("T5-4: clicking a built-in language calls onLanguageChange with its code and closes the dropdown", () => {
    const { onLanguageChange } = renderSelector();
    openDropdown();

    fireEvent.click(screen.getByRole("option", { name: /Spanish/ }));

    expect(onLanguageChange).toHaveBeenCalledWith(builtIn);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("Row state by language status (T5-5, T5-6)", () => {
  test("T5-5: an addable (not cached) language has an Add button and its name cannot be clicked", () => {
    renderSelector();
    openDropdown();

    const row = screen.getByRole("option", { name: /Japanese/ }).closest("li")!;
    const name = within(row).getByRole("option");
    expect(name).toBeDisabled();
    expect(
      within(row).getByRole("button", { name: en.header.languageAdd }),
    ).toBeInTheDocument();
  });

  test("T5-6: a cached language has no Add button and its name can be clicked", () => {
    setCachedLanguages([added]);
    renderSelector();
    openDropdown();

    const row = screen.getByRole("option", { name: /Korean/ }).closest("li")!;
    const name = within(row).getByRole("option");
    expect(name).not.toBeDisabled();
    expect(
      within(row).queryByRole("button", { name: en.header.languageAdd }),
    ).not.toBeInTheDocument();
  });
});

describe("Adding a language (T5-7 to T5-9)", () => {
  test("T5-7: clicking Add shows 'preparing' on that row while other rows stay usable", async () => {
    let resolveBuild!: (value: { ok: true }) => void;
    buildLanguagePackMock.mockReturnValue(
      new Promise((resolve) => {
        resolveBuild = resolve;
      }),
    );
    renderSelector();
    openDropdown();

    const row = screen.getByRole("option", { name: /Japanese/ }).closest("li")!;
    fireEvent.click(
      within(row).getByRole("button", { name: en.header.languageAdd }),
    );

    expect(
      within(row).getByText(en.header.languagePreparing),
    ).toBeInTheDocument();
    // A built-in row elsewhere in the list is still clickable while ja builds.
    expect(screen.getByRole("option", { name: /Spanish/ })).not.toBeDisabled();

    resolveBuild({ ok: true });
    await within(row).findByRole("button", { name: en.header.languageAdd });
  });

  test("T5-8: a failed build shows the failure note and offers Add again", async () => {
    buildLanguagePackMock.mockResolvedValue({
      ok: false,
      reason: "Could not add. Try again.",
    });
    renderSelector();
    openDropdown();

    const row = screen.getByRole("option", { name: /Japanese/ }).closest("li")!;
    fireEvent.click(
      within(row).getByRole("button", { name: en.header.languageAdd }),
    );

    expect(
      await within(row).findByText(en.header.languageAddFailed),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: en.header.languageAdd }),
    ).toBeInTheDocument();
  });

  test("T5-9: a successful build removes the Add button and makes the row clickable", async () => {
    buildLanguagePackMock.mockImplementation(async (code: string) => {
      markLanguageCached(code);
      return { ok: true };
    });
    renderSelector();
    openDropdown();

    const row = screen.getByRole("option", { name: /Japanese/ }).closest("li")!;
    fireEvent.click(
      within(row).getByRole("button", { name: en.header.languageAdd }),
    );

    await screen.findByRole("option", { name: /Japanese/ });
    // Re-open reflects the now-cached status once the dropdown re-queries it.
    const refreshedRow = screen
      .getByRole("option", { name: /Japanese/ })
      .closest("li")!;
    expect(
      within(refreshedRow).queryByRole("button", {
        name: en.header.languageAdd,
      }),
    ).not.toBeInTheDocument();
    expect(within(refreshedRow).getByRole("option")).not.toBeDisabled();
  });
});

describe("Closing the dropdown (T5-10)", () => {
  test("T5-10: pressing Escape closes the open dropdown", () => {
    renderSelector();
    openDropdown();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
