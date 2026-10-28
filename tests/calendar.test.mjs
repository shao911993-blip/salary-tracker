import assert from "node:assert/strict";
import test from "node:test";
import { dayTotals, formatCompactCurrency, monthCells, sortDayRecords } from "../lib/calendar.ts";

const makeRecord = (overrides = {}) => ({
  id: "r", date: "2026-10-07", entryMode: "time", startTime: "09:00", endTime: "13:00", endDate: "2026-10-07",
  breakMinutes: 0, regularHours: 4, overtimeHours: 0, overtimeMode: "auto", regularHoursPerDay: 8,
  overtimeMultiplier: 1.5, hourlyRate: 200, allowance: 0, note: "", createdAt: "2026-10-07T01:00:00.000Z", ...overrides,
});

const days = (cells) => cells.filter(Boolean);
const blanks = (cells) => cells.indexOf(cells.find(Boolean));

test("month grids start on Monday with the right number of leading blanks", () => {
  assert.equal(blanks(monthCells("2026-10")), 3); // 1 Oct 2026 is a Thursday
  assert.equal(blanks(monthCells("2026-06")), 0); // Monday
  assert.equal(blanks(monthCells("2026-03")), 6); // Sunday
});

test("leap years give February 29 days, other years 28", () => {
  assert.equal(days(monthCells("2028-02")).length, 29);
  assert.equal(days(monthCells("2028-02")).at(-1), "2028-02-29");
  assert.equal(days(monthCells("2026-02")).length, 28);
  assert.equal(days(monthCells("2100-02")).length, 28); // divisible by 100, not 400
  assert.equal(days(monthCells("2000-02")).length, 29); // divisible by 400
});

test("every date lands in its weekday column, checked independently in UTC", () => {
  for (let year = 2024; year <= 2030; year++) {
    for (let month = 1; month <= 12; month++) {
      const cells = monthCells(`${year}-${String(month).padStart(2, "0")}`);
      cells.forEach((date, index) => {
        if (!date) return;
        const [y, m, d] = date.split("-").map(Number);
        const mondayFirst = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
        assert.equal(index % 7, mondayFirst, date);
      });
      assert.equal(days(cells).length, new Date(Date.UTC(year, month, 0)).getUTCDate());
    }
  }
});

test("daily totals include only the month shown, across month and year edges", () => {
  const records = [
    makeRecord({ id: "sep", date: "2026-09-30" }),
    makeRecord({ id: "first", date: "2026-10-01" }),
    makeRecord({ id: "last", date: "2026-10-31" }),
    makeRecord({ id: "nov", date: "2026-11-01" }),
  ];
  assert.deepEqual([...dayTotals(records, "2026-10").keys()].sort(), ["2026-10-01", "2026-10-31"]);
  assert.deepEqual([...dayTotals([makeRecord({ date: "2026-12-31" }), makeRecord({ id: "jan", date: "2027-01-01" })], "2027-01").keys()], ["2027-01-01"]);
});

test("same-day records add up hours, overtime and pay", () => {
  const morning = makeRecord({ id: "am" });
  const evening = makeRecord({ id: "pm", startTime: "13:00", endTime: "23:00", regularHours: 8, overtimeHours: 2, allowance: 100 });
  const day = dayTotals([morning, evening], "2026-10").get("2026-10-07");
  assert.equal(day.hours, 14);
  assert.equal(day.overtimeHours, 2);
  assert.equal(day.pay, 4 * 200 + 8 * 200 + 2 * 200 * 1.5 + 100);
  assert.equal(day.records.length, 2);
});

test("a day's records list timed entries by start time, then hours-only entries", () => {
  const late = makeRecord({ id: "late", startTime: "18:00" });
  const early = makeRecord({ id: "early", startTime: "09:00" });
  const hoursOnly = makeRecord({ id: "hours", entryMode: "hours", startTime: "", endTime: "", createdAt: "2026-10-07T00:00:00.000Z" });
  assert.deepEqual(sortDayRecords([hoursOnly, late, early]).map((record) => record.id), ["early", "late", "hours"]);
});

test("compact amounts stay short enough for phone-width cells", () => {
  assert.equal(formatCompactCurrency(0), "$0");
  assert.equal(formatCompactCurrency(999), "$999");
  assert.equal(formatCompactCurrency(1000), "$1k");
  assert.equal(formatCompactCurrency(1360), "$1.4k");
  assert.equal(formatCompactCurrency(9999), "$10k");
  assert.equal(formatCompactCurrency(11600), "$12k");
});
