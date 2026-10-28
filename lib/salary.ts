import { z } from "zod";

const finiteNumber = z.number().finite();
const nonnegative = finiteNumber.nonnegative();
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "無效的日期");
const timestamp = z.string().datetime({ offset: true });

export const DEFAULT_SETTINGS = {
  hourlyRate: 200,
  defaultBreakMinutes: 60,
  defaultStart: "09:00",
  defaultEnd: "18:00",
  regularHoursPerDay: 8,
  defaultOvertimeMultiplier: 1.34,
};

const settingsSchema = z.object({
  hourlyRate: finiteNumber.positive().default(DEFAULT_SETTINGS.hourlyRate),
  defaultBreakMinutes: nonnegative.default(DEFAULT_SETTINGS.defaultBreakMinutes),
  defaultStart: time.default(DEFAULT_SETTINGS.defaultStart),
  defaultEnd: time.default(DEFAULT_SETTINGS.defaultEnd),
  regularHoursPerDay: finiteNumber.positive().default(DEFAULT_SETTINGS.regularHoursPerDay),
  defaultOvertimeMultiplier: finiteNumber.positive().default(DEFAULT_SETTINGS.defaultOvertimeMultiplier),
});

// Saved settings only seed new records. Older versions let fields such as the
// default start time be cleared, so a bad stored value falls back to its
// default instead of locking the whole account out.
const storedSettingsSchema = settingsSchema.extend({
  hourlyRate: settingsSchema.shape.hourlyRate.catch(DEFAULT_SETTINGS.hourlyRate),
  defaultBreakMinutes: settingsSchema.shape.defaultBreakMinutes.catch(DEFAULT_SETTINGS.defaultBreakMinutes),
  defaultStart: settingsSchema.shape.defaultStart.catch(DEFAULT_SETTINGS.defaultStart),
  defaultEnd: settingsSchema.shape.defaultEnd.catch(DEFAULT_SETTINGS.defaultEnd),
  regularHoursPerDay: settingsSchema.shape.regularHoursPerDay.catch(DEFAULT_SETTINGS.regularHoursPerDay),
  defaultOvertimeMultiplier: settingsSchema.shape.defaultOvertimeMultiplier.catch(DEFAULT_SETTINGS.defaultOvertimeMultiplier),
});

export const recordSchema = z.object({
  id: z.string().min(1),
  date,
  entryMode: z.enum(["time", "hours"]),
  startTime: z.string(),
  endTime: z.string(),
  endDate: date.optional(),
  breakMinutes: nonnegative,
  regularHours: nonnegative,
  overtimeHours: nonnegative,
  // Old backups have no mode. Preserve their explicit amounts on migration.
  overtimeMode: z.enum(["auto", "manual"]).default("manual"),
  regularHoursPerDay: finiteNumber.positive().optional(),
  overtimeMultiplier: finiteNumber.positive(),
  hourlyRate: finiteNumber.positive(),
  allowance: finiteNumber,
  note: z.string(),
  createdAt: timestamp,
}).superRefine((record, context) => {
  if (record.entryMode === "time" &&
      (!time.safeParse(record.startTime).success || !time.safeParse(record.endTime).success)) {
    context.addIssue({ code: "custom", message: "無效的上下班時間" });
  }
  if (record.endDate && record.endDate < record.date) {
    context.addIssue({ code: "custom", message: "下班日期不得早於上班日期" });
  }
  if (record.regularHours + record.overtimeHours <= 0 ||
      !Number.isFinite(record.regularHours + record.overtimeHours) ||
      !Number.isFinite(recordPay(record))) {
    context.addIssue({ code: "custom", message: "工時與薪資必須為有效數值" });
  }
});

const stateSchema = z.object({
  version: z.literal(1),
  updatedAt: nonnegative.int().default(0),
  settings: storedSettingsSchema,
  records: z.array(recordSchema),
  activeShift: z.object({ startedAt: timestamp }).nullable().default(null),
}).superRefine((state, context) => {
  if (new Set(state.records.map((record) => record.id)).size !== state.records.length) {
    context.addIssue({ code: "custom", message: "工時紀錄 ID 重複" });
  }
});

export type Settings = z.infer<typeof settingsSchema>;
export type WorkRecord = z.infer<typeof recordSchema>;
export type AppState = z.infer<typeof stateSchema>;
export type EntryMode = WorkRecord["entryMode"];
export type ClockTimes = { start: string; end: string; date: string; endDate: string };
export type RecordDraft = {
  date: string;
  endDate: string;
  entryMode: EntryMode;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  totalHours: string;
  overtimeHours: string;
  overtimeMultiplier: string;
  hourlyRate: string;
  allowance: string;
  note: string;
};

export const DEFAULT_STATE: AppState = {
  version: 1,
  updatedAt: 0,
  settings: DEFAULT_SETTINGS,
  records: [],
  activeShift: null,
};

export function parseState(value: unknown): AppState {
  return stateSchema.parse(value);
}

export function parseSettings(value: unknown): Settings {
  return settingsSchema.parse(value);
}

export function localDateString(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function addDays(value: string, amount: number) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || !Number.isFinite(amount)) return value;
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

export function effectiveEndDate(draft: Pick<RecordDraft, "date" | "endDate" | "startTime" | "endTime">) {
  return draft.endDate === draft.date && draft.endTime < draft.startTime
    ? addDays(draft.date, 1)
    : draft.endDate;
}

export function emptyDraft(settings: Settings, mode: EntryMode = "time"): RecordDraft {
  const today = localDateString();
  return {
    date: today,
    endDate: today,
    entryMode: mode,
    startTime: settings.defaultStart,
    endTime: settings.defaultEnd,
    breakMinutes: String(settings.defaultBreakMinutes),
    totalHours: String(settings.regularHoursPerDay),
    overtimeHours: "",
    overtimeMultiplier: String(settings.defaultOvertimeMultiplier),
    hourlyRate: String(settings.hourlyRate),
    allowance: "0",
    note: "",
  };
}

export function draftFromRecord(record: WorkRecord): RecordDraft {
  return {
    date: record.date,
    endDate: record.endDate ?? (record.endTime < record.startTime ? addDays(record.date, 1) : record.date),
    entryMode: record.entryMode,
    startTime: record.startTime,
    endTime: record.endTime,
    breakMinutes: String(record.breakMinutes),
    totalHours: String(record.regularHours + record.overtimeHours),
    overtimeHours: record.overtimeMode === "auto" ? "" : String(record.overtimeHours),
    overtimeMultiplier: String(record.overtimeMultiplier),
    hourlyRate: String(record.hourlyRate),
    allowance: String(record.allowance),
    note: record.note,
  };
}

export function recordPay(record: { regularHours: number; hourlyRate: number; overtimeHours: number; overtimeMultiplier: number; allowance: number }): number {
  return record.regularHours * record.hourlyRate +
    record.overtimeHours * record.hourlyRate * record.overtimeMultiplier + record.allowance;
}

export function recalculateRecords(records: WorkRecord[], fallbackLimit: number): WorkRecord[] {
  // Each record is compared with the daily limit on its own. Same-day entries
  // may belong to different jobs, so their hours are never pooled.
  return records.map((record) => {
    if (record.overtimeMode !== "auto") return record;
    const totalHours = record.regularHours + record.overtimeHours;
    const limit = record.regularHoursPerDay ?? fallbackLimit;
    const regularHours = Math.min(totalHours, limit);
    return { ...record, regularHoursPerDay: limit, regularHours, overtimeHours: totalHours - regularHours };
  });
}

export function recordFromDraft(
  draft: RecordDraft,
  settings: Settings,
  records: WorkRecord[],
  existing: WorkRecord | null = null,
  id = "__preview__",
): WorkRecord {
  const endDate = draft.date && draft.endDate ? effectiveEndDate(draft) : draft.endDate;
  const duration = (Date.parse(`${endDate}T${draft.endTime}:00Z`) - Date.parse(`${draft.date}T${draft.startTime}:00Z`)) / 3_600_000;
  const totalHours = draft.entryMode === "time"
    ? Math.max(0, duration - (Number(draft.breakMinutes) || 0) / 60)
    : Math.max(0, Number(draft.totalHours) || 0);
  const overtimeMode = draft.overtimeHours.trim() ? "manual" : "auto";
  const overtimeHours = overtimeMode === "manual" ? Math.min(totalHours, Math.max(0, Number(draft.overtimeHours) || 0)) : 0;
  const candidate: WorkRecord = {
    id: existing?.id ?? id,
    date: draft.date,
    entryMode: draft.entryMode,
    startTime: draft.entryMode === "time" ? draft.startTime : "",
    endTime: draft.entryMode === "time" ? draft.endTime : "",
    ...(draft.entryMode === "time" ? { endDate } : {}),
    breakMinutes: draft.entryMode === "time" ? Math.max(0, Number(draft.breakMinutes) || 0) : 0,
    regularHours: totalHours - overtimeHours,
    overtimeHours,
    overtimeMode,
    regularHoursPerDay: existing?.regularHoursPerDay ?? settings.regularHoursPerDay,
    overtimeMultiplier: Number(draft.overtimeMultiplier),
    hourlyRate: Number(draft.hourlyRate),
    allowance: Number(draft.allowance) || 0,
    note: draft.note.trim(),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  return recalculateRecords([...records.filter((record) => record.id !== candidate.id), candidate], settings.regularHoursPerDay).find((record) => record.id === candidate.id)!;
}

export function recordTimeLabel(record: WorkRecord) {
  if (record.entryMode === "hours") return "手動輸入時數";
  const end = record.endDate && record.endDate !== record.date ? `${record.endDate} ${record.endTime}` : record.endTime;
  return `${record.startTime}–${end}`;
}
