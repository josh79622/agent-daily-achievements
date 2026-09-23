// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DateSelector } from "../../web/DateSelector.js";
import { getTodayDate, shiftDateString } from "../../web/date-utils.js";
import { en } from "../../web/i18n.js";

// Task 5 (docs/plans/2026-09-21-task-5-component-tests-test-cases.md),
// cases T5-11 to T5-15.
afterEach(cleanup);

const selectedDate = "2026-09-15";

describe("Arrow glyphs by direction (T5-11, T5-12)", () => {
  test("T5-11: in a left-to-right language, previous shows ← and next shows →", () => {
    render(
      <DateSelector
        selectedDate={selectedDate}
        onDateChange={vi.fn()}
        t={en}
        direction="ltr"
      />,
    );

    expect(
      screen.getByRole("button", { name: en.header.datePrev }),
    ).toHaveTextContent("←");
    expect(
      screen.getByRole("button", { name: en.header.dateNext }),
    ).toHaveTextContent("→");
  });

  test("T5-12: in a right-to-left language the two glyphs are swapped", () => {
    render(
      <DateSelector
        selectedDate={selectedDate}
        onDateChange={vi.fn()}
        t={en}
        direction="rtl"
      />,
    );

    expect(
      screen.getByRole("button", { name: en.header.datePrev }),
    ).toHaveTextContent("→");
    expect(
      screen.getByRole("button", { name: en.header.dateNext }),
    ).toHaveTextContent("←");
  });
});

describe("Stepping the date (T5-13, T5-14)", () => {
  test("T5-13: clicking previous day calls onDateChange with the day before the selected one", () => {
    const onDateChange = vi.fn();
    render(
      <DateSelector
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        t={en}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: en.header.datePrev }));

    expect(onDateChange).toHaveBeenCalledWith(
      shiftDateString(selectedDate, -1),
    );
  });

  test("T5-14: when today is selected, 'next day' is disabled", () => {
    render(
      <DateSelector
        selectedDate={getTodayDate()}
        onDateChange={vi.fn()}
        t={en}
      />,
    );

    expect(
      screen.getByRole("button", { name: en.header.dateNext }),
    ).toBeDisabled();
  });
});

describe("Disabled stepper (T5-15)", () => {
  test("T5-15: clicking a control while disabled never calls onDateChange", () => {
    const onDateChange = vi.fn();
    render(
      <DateSelector
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        t={en}
        disabled
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: en.header.datePrev }));
    fireEvent.click(screen.getByRole("button", { name: en.header.dateNext }));

    expect(onDateChange).not.toHaveBeenCalled();
  });
});

describe("Today icon control (HIC-1, HIC-3 to HIC-5)", () => {
  test("does not render a dedicated today button to preserve symmetrical stepper layout", () => {
    render(
      <DateSelector
        selectedDate={selectedDate}
        onDateChange={vi.fn()}
        t={en}
      />,
    );

    expect(
      screen.queryByRole("button", { name: en.header.dateToday }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(en.header.selectDate)).toHaveAttribute(
      "type",
      "date",
    );
  });
});

describe("Open window date boundary (W1-14, W1-15)", () => {
  test("W1-14: given the selected date is the open window date (before 07:00), next day is disabled", () => {
    vi.useFakeTimers();
    try {
      // 03:00 local time -> open window is previous calendar day
      vi.setSystemTime(new Date(2026, 8, 19, 3, 0, 0));
      const openWindowDate = getTodayDate();

      render(
        <DateSelector
          selectedDate={openWindowDate}
          onDateChange={vi.fn()}
          t={en}
        />,
      );

      expect(
        screen.getByRole("button", { name: en.header.dateNext }),
      ).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("W1-14: given the selected date is the open window date (after 07:00), next day is disabled", () => {
    vi.useFakeTimers();
    try {
      // 10:00 local time -> open window is current calendar day
      vi.setSystemTime(new Date(2026, 8, 19, 10, 0, 0));
      const openWindowDate = getTodayDate();

      render(
        <DateSelector
          selectedDate={openWindowDate}
          onDateChange={vi.fn()}
          t={en}
        />,
      );

      expect(
        screen.getByRole("button", { name: en.header.dateNext }),
      ).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("W1-15: given the selected date is earlier than the open window date, next day is enabled", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 8, 19, 10, 0, 0));
      const earlierDate = shiftDateString(getTodayDate(), -1);

      render(
        <DateSelector
          selectedDate={earlierDate}
          onDateChange={vi.fn()}
          t={en}
        />,
      );

      expect(
        screen.getByRole("button", { name: en.header.dateNext }),
      ).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
