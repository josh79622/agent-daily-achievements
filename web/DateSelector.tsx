import type { Translations } from "./i18n.js";
import { dayArrowGlyphs, getTodayDate, shiftDateString } from "./date-utils.js";
import type { Direction } from "../src/report/languages.js";

export interface DateSelectorProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  disabled?: boolean;
  t: Translations;
  className?: string;
  /** The page's reading direction (test L3-8, L3-9); defaults to "ltr". */
  direction?: Direction;
}

export function DateSelector({
  selectedDate,
  onDateChange,
  disabled = false,
  t,
  className = "",
  direction = "ltr",
}: DateSelectorProps) {
  const today = getTodayDate();
  const isToday = selectedDate === today;
  const { prev, next } = dayArrowGlyphs(direction);

  const handleShift = (offset: number) => {
    if (disabled) return;
    const next = shiftDateString(selectedDate, offset);
    onDateChange(next);
  };

  return (
    <div className={`date-selector-group ${className}`}>
      {/* 1. <- Previous Day */}
      <button
        type="button"
        className="zen-nav-btn date-selector-btn"
        onClick={() => handleShift(-1)}
        disabled={disabled}
        title={t.header.datePrev}
        aria-label={t.header.datePrev}
      >
        {prev}
      </button>

      {/* 2. 日期 input */}
      <input
        type="date"
        className="zen-date-input date-selector-input"
        value={selectedDate}
        max={today}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value) {
            onDateChange(e.target.value);
          }
        }}
        title={t.header.selectDate}
        aria-label={t.header.selectDate}
      />

      {/* 3. 本日 / Today */}
      <button
        type="button"
        className={`zen-nav-btn date-selector-btn ${isToday ? "active" : ""}`}
        onClick={() => !disabled && onDateChange(today)}
        disabled={disabled}
        title={t.header.dateToday}
      >
        {t.header.dateToday}
      </button>

      {/* 4. -> Next Day */}
      <button
        type="button"
        className="zen-nav-btn date-selector-btn"
        onClick={() => handleShift(1)}
        disabled={disabled || isToday}
        title={t.header.dateNext}
        aria-label={t.header.dateNext}
      >
        {next}
      </button>
    </div>
  );
}
