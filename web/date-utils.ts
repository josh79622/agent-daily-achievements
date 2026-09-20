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
