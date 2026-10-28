import { recordPay } from "./salary.ts";
import type { WorkRecord } from "./salary.ts";

export type DayTotal = { hours: number; overtimeHours: number; pay: number; records: WorkRecord[] };

// The month grid starts on Monday, matching the weekday chart on the overview.
// Leading `null`s pad the first week; the rest are "YYYY-MM-DD" dates.
export function monthCells(month: string): (string | null)[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const leadingBlanks = (new Date(year, monthIndex - 1, 1).getDay() + 6) % 7;
  return [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`),
  ];
}

// Totals per date for the records that fall in `month`.
export function dayTotals(records: WorkRecord[], month: string): Map<string, DayTotal> {
  const map = new Map<string, DayTotal>();
  records.forEach((record) => {
    if (record.date.slice(0, 7) !== month) return;
    const day = map.get(record.date) ?? { hours: 0, overtimeHours: 0, pay: 0, records: [] };
    day.hours += record.regularHours + record.overtimeHours;
    day.overtimeHours += record.overtimeHours;
    day.pay += recordPay(record);
    day.records.push(record);
    map.set(record.date, day);
  });
  return map;
}

// Timed entries by start time, then hours-only entries, each in creation order.
export function sortDayRecords(records: WorkRecord[]): WorkRecord[] {
  return [...records].sort((a, b) =>
    (a.entryMode === "time" ? a.startTime : "24:00").localeCompare(b.entryMode === "time" ? b.startTime : "24:00") ||
    a.createdAt.localeCompare(b.createdAt));
}

// Calendar cells on phones are ~45px wide, so amounts of a thousand or more
// are shortened to "$1.6k" / "$12k".
export function formatCompactCurrency(value: number) {
  const rounded = Math.round(value);
  if (Math.abs(rounded) < 1000) return `$${rounded}`;
  return `$${Number((rounded / 1000).toFixed(Math.abs(rounded) < 10_000 ? 1 : 0))}k`;
}
