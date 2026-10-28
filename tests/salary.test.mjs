import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS, DEFAULT_STATE, draftFromRecord, emptyDraft,
  parseSettings, parseState, recalculateRecords, recordFromDraft, recordPay, recordSchema,
} from "../lib/salary.ts";

const settings = DEFAULT_SETTINGS;
const makeRecord = (overrides = {}) => ({
  id: "first", date: "2026-10-28", entryMode: "time", startTime: "09:00", endTime: "15:00",
  endDate: "2026-10-28", breakMinutes: 0, regularHours: 6, overtimeHours: 0,
  overtimeMode: "auto", regularHoursPerDay: 8, overtimeMultiplier: 1.34,
  hourlyRate: 200, allowance: 0, note: "", createdAt: "2026-10-28T01:00:00.000Z", ...overrides,
});
const first = makeRecord();
const second = makeRecord({ id: "second", startTime: "15:00", endTime: "21:00" });

test("two six-hour shifts on the same day are calculated separately", () => {
  const records = recalculateRecords([second, first], 8);
  assert.equal(records.reduce((sum, r) => sum + r.regularHours, 0), 12);
  assert.equal(records.reduce((sum, r) => sum + r.overtimeHours, 0), 0);
  assert.equal(records.reduce((sum, r) => sum + recordPay(r), 0), 2400);
});

test("editing or removing one shift leaves another same-day shift unchanged", () => {
  const existing = recalculateRecords([first, second], 8);
  const changed = recordFromDraft({ ...draftFromRecord(existing[0]), endTime: "19:00" }, settings, existing, existing[0]);
  assert.equal(changed.overtimeHours, 2);
  const updated = recalculateRecords([changed, existing[1]], 8);
  assert.deepEqual(updated[1], existing[1]);
  assert.deepEqual(recalculateRecords([existing[1]], 8)[0], existing[1]);
});

test("automatic overtime remains automatic when editing eight hours to ten", () => {
  const record = makeRecord({ endTime: "18:00", breakMinutes: 60, regularHours: 8 });
  const draft = { ...draftFromRecord(record), endTime: "20:00" };
  assert.equal(draft.overtimeHours, "");
  const changed = recordFromDraft(draft, settings, [record], record);
  assert.equal(changed.regularHours, 8);
  assert.equal(changed.overtimeHours, 2);
  assert.equal(changed.overtimeMode, "auto");
});

test("manual overrides remain explicit during editing and recalculation", () => {
  const record = makeRecord({ overtimeMode: "manual", regularHours: 4, overtimeHours: 2 });
  const changed = recordFromDraft({ ...draftFromRecord(record), endTime: "19:00" }, settings, [record], record);
  assert.equal(changed.overtimeHours, 2);
  assert.equal(recalculateRecords([changed], 1)[0].overtimeHours, 2);
});

test("hours-only shifts use the same automatic daily calculation", () => {
  const draft = { ...emptyDraft(settings, "hours"), date: first.date, totalHours: "10" };
  const record = recordFromDraft(draft, settings, [first], null, "hours-only");
  assert.equal(record.regularHours, 8);
  assert.equal(record.overtimeHours, 2);
});

test("different dates have separate limits and historical settings stay fixed", () => {
  const records = recalculateRecords([first, makeRecord({ id: "next-day", date: "2026-10-29" })], 4);
  assert.equal(records[0].overtimeHours, 0);
  assert.equal(records[1].overtimeHours, 0);
  const moved = recalculateRecords([first, { ...second, date: "2026-10-29" }], 8);
  assert.equal(moved[1].overtimeHours, 0);
});

test("26-hour and exactly 24-hour shifts retain the end date", () => {
  const draft = { ...emptyDraft(settings), date: "2026-10-28", endDate: "2026-10-29", startTime: "09:00", endTime: "11:00" };
  const record = recordFromDraft(draft, settings, []);
  assert.equal(record.regularHours + record.overtimeHours, 25);
  assert.equal(record.overtimeHours, 17);
  const fullDay = recordFromDraft({ ...draft, endTime: "09:00" }, settings, []);
  assert.equal(fullDay.regularHours + fullDay.overtimeHours, 23);
  assert.equal(draftFromRecord(record).endDate, "2026-10-29");
});

test("overnight input still infers the following date when no extra date was selected", () => {
  const record = recordFromDraft({ ...emptyDraft(settings), date: "2026-12-31", endDate: "2026-12-31", startTime: "22:00", endTime: "06:00" }, settings, []);
  assert.equal(record.regularHours + record.overtimeHours, 7);
  assert.equal(record.endDate, "2027-01-01");
});

test("legacy version-one backups preserve recorded amounts and migrate safely", () => {
  const legacy = makeRecord({ regularHours: 4, overtimeHours: 2 });
  delete legacy.overtimeMode;
  delete legacy.regularHoursPerDay;
  delete legacy.endDate;
  const parsed = parseState({ version: 1, settings, records: [legacy] });
  assert.equal(parsed.updatedAt, 0);
  assert.equal(parsed.records[0].overtimeMode, "manual");
  assert.equal(parsed.records[0].regularHours, 4);
  assert.equal(parsed.records[0].overtimeHours, 2);
  assert.equal(draftFromRecord(parsed.records[0]).overtimeHours, "2");
});

test("invalid drafts cannot become saved records", () => {
  for (const changes of [
    { date: "", endDate: "" }, { endDate: "2026-10-27" }, { startTime: "" },
    { hourlyRate: "Infinity" }, { breakMinutes: "99999" },
  ]) {
    const record = recordFromDraft({ ...emptyDraft(settings), date: "2026-10-28", endDate: "2026-10-28", ...changes }, settings, []);
    assert.equal(recordSchema.safeParse(record).success, false);
  }
});

test("malformed backups are rejected before they can replace current data", () => {
  const invalid = [
    null, {}, { ...DEFAULT_STATE, version: 2 },
    { ...DEFAULT_STATE, records: [null] },
    { ...DEFAULT_STATE, records: [{ ...first, date: "2026-02-30" }] },
    { ...DEFAULT_STATE, records: [{ ...first, date: undefined }] },
    { ...DEFAULT_STATE, records: [{ ...first, startTime: "99:99" }] },
    { ...DEFAULT_STATE, records: [{ ...first, regularHours: "6" }] },
    { ...DEFAULT_STATE, records: [{ ...first, regularHours: -1 }] },
    { ...DEFAULT_STATE, records: [{ ...first, hourlyRate: Infinity }] },
    { ...DEFAULT_STATE, records: [first, first] },
    { ...DEFAULT_STATE, activeShift: { startedAt: "invalid" } },
  ];
  for (const value of invalid) assert.throws(() => parseState(value));
});

test("invalid saved settings fall back to defaults instead of rejecting the records", () => {
  const parsed = parseState({
    version: 1,
    settings: { ...settings, defaultStart: "", defaultEnd: "", hourlyRate: 0 },
    records: [first],
  });
  assert.equal(parsed.settings.defaultStart, DEFAULT_SETTINGS.defaultStart);
  assert.equal(parsed.settings.defaultEnd, DEFAULT_SETTINGS.defaultEnd);
  assert.equal(parsed.settings.hourlyRate, DEFAULT_SETTINGS.hourlyRate);
  assert.deepEqual(parsed.records, [first]);
});

test("the settings form still rejects invalid values", () => {
  assert.throws(() => parseSettings({ ...settings, defaultStart: "" }));
  assert.throws(() => parseSettings({ ...settings, hourlyRate: 0 }));
});
