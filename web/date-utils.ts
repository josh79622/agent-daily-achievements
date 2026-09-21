import type { Direction } from "../src/report/languages.js";

/**
 * The glyph each day-arrow button shows for a reading direction (Task L3,
 * tests L3-8, L3-9). The buttons' meaning never changes — "previous" always
 * moves to the earlier date — only the glyph, chosen so it points toward the
 * start of the reading order.
 */
export function dayArrowGlyphs(direction: Direction): {
  prev: string;
  next: string;
} {
  return direction === "rtl"
    ? { prev: "→", next: "←" }
    : { prev: "←", next: "→" };
}

export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalDate(d);
}

export function getTodayDate(): string {
  return formatLocalDate(new Date());
}

export function shiftDateString(dateStr: string, offsetDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const current = new Date(Date.UTC(y, m - 1, d));
  current.setUTCDate(current.getUTCDate() + offsetDays);
  const nextDate = current.toISOString().slice(0, 10);
  const today = getTodayDate();
  if (nextDate > today) return today;
  return nextDate;
}
