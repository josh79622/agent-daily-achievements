import type { Translations } from "./i18n.js";
import { getTodayDate, shiftDateString } from "./date-utils.js";

export interface DateSelectorProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  disabled?: boolean;
  t: Translations;
  className?: string;
}

export function DateSelector({
  selectedDate,
  onDateChange,
  disabled = false,
  t,
  className = "",
}: DateSelectorProps) {
  const today = getTodayDate();
  const isToday = selectedDate === today;

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
        ←
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
        →
      </button>
    </div>
  );
}
