// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { HeaderIconButton } from "../../web/HeaderIconButton.js";

afterEach(cleanup);

describe("HeaderIconButton", () => {
  test("exposes a localized accessible name and matching tooltip for pointer and keyboard users", () => {
    render(
      <HeaderIconButton label="本機紀錄">
        <span aria-hidden="true">📂</span>
      </HeaderIconButton>,
    );

    const button = screen.getByRole("button", { name: "本機紀錄" });
    const tooltip = screen.getByRole("tooltip", { hidden: true });

    expect(button).toHaveClass("header-icon-button");
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
    expect(tooltip).toHaveTextContent("本機紀錄");
    expect(tooltip).not.toHaveClass("is-visible");

    fireEvent.pointerEnter(button);
    expect(tooltip).toHaveClass("is-visible");
    fireEvent.pointerLeave(button);
    expect(tooltip).not.toHaveClass("is-visible");

    fireEvent.focus(button);
    expect(tooltip).toHaveClass("is-visible");
    fireEvent.blur(button);
    expect(tooltip).not.toHaveClass("is-visible");
  });

  test("forwards unavailable and expanded state without invoking a disabled action", () => {
    const onClick = vi.fn();
    render(
      <HeaderIconButton
        label="設定"
        disabled
        aria-expanded={true}
        aria-pressed={true}
        onClick={onClick}
      >
        <span aria-hidden="true">⚙️</span>
      </HeaderIconButton>,
    );

    const button = screen.getByRole("button", { name: "設定" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
