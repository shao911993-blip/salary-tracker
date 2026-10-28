"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  AlarmClock,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CloudOff,
  Download,
  FileJson,
  History,
  Pencil,
  Play,
  Plus,
  Settings2,
  ShieldCheck,
  Smartphone,
  Square,
  Trash2,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

import {
  DEFAULT_STATE,
  addDays,
  draftFromRecord,
  emptyDraft,
  localDateString,
  parseSettings,
  parseState,
  recalculateRecords,
  recordFromDraft,
  recordPay,
  recordSchema,
  recordTimeLabel,
} from "@/lib/salary";
import type { AppState, ClockTimes, EntryMode, RecordDraft, Settings, WorkRecord } from "@/lib/salary";
import { stateStorage } from "@/lib/salary-storage";
import { dayTotals as monthDayTotals, formatCompactCurrency, monthCells, sortDayRecords } from "@/lib/calendar";

function saveError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "儲存失敗，請重試");
}

function localTimeString(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function currentMonthString(date = new Date()) {
  return localDateString(date).slice(0, 7);
}

function changeMonth(month: string, amount: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const next = new Date(year, monthIndex - 1 + amount, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  if (!month) return "載入中";
  const [year, monthIndex] = month.split("-");
  return `${year} 年 ${Number(monthIndex)} 月`;
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function RecordDateBadge({ date }: { date: string }) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()];
  return (
    <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-slate-100 leading-tight text-slate-700">
      <span className="text-xs font-bold tabular-nums">{month}/{day}</span>
      <span className="text-[11px] text-slate-500">週{weekday}</span>
    </div>
  );
}

function RecordRow({ record, onEdit, onDeleteRequest }: { record: WorkRecord; onEdit: () => void; onDeleteRequest: () => void }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6">
      <RecordDateBadge date={record.date} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold">{formatHours(record.regularHours + record.overtimeHours)}</p>
          {record.overtimeHours > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">加班 {Number(record.overtimeHours.toFixed(2))}h</span>}
        </div>
        <p className="mt-1 truncate text-sm text-slate-500">{recordTimeLabel(record)}{record.note ? ` · ${record.note}` : ""}</p>
      </div>
      <p className="shrink-0 font-semibold tabular-nums">{formatCurrency(recordPay(record))}</p>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label={`編輯 ${record.date} 紀錄`} onClick={onEdit}><Pencil /></Button>
        <Button variant="ghost" size="icon-sm" className="text-red-500 hover:bg-red-50 hover:text-red-600" aria-label={`刪除 ${record.date} 紀錄`} onClick={onDeleteRequest}><Trash2 /></Button>
      </div>
    </div>
  );
}

type PeriodType = "month" | "quarter" | "year";

function currentQuarterString(date = new Date()) {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

function currentYearOnlyString(date = new Date()) {
  return String(date.getFullYear());
}

function changeQuarter(value: string, amount: number) {
  const [yearStr, quarterStr] = value.split("-Q");
  let year = Number(yearStr);
  let quarter = Number(quarterStr) + amount;
  while (quarter < 1) {
    quarter += 4;
    year -= 1;
  }
  while (quarter > 4) {
    quarter -= 4;
    year += 1;
  }
  return `${year}-Q${quarter}`;
}

function changeYearOnly(value: string, amount: number) {
  return String(Number(value) + amount);
}

function quarterMonthRange(value: string) {
  const [yearStr, quarterStr] = value.split("-Q");
  const year = Number(yearStr);
  const quarter = Number(quarterStr);
  const startMonth = (quarter - 1) * 3 + 1;
  return { year, startMonth, endMonth: startMonth + 2 };
}

function recordsInPeriod(records: WorkRecord[], type: PeriodType, value: string) {
  if (type === "month") return records.filter((record) => record.date.startsWith(value));
  if (type === "year") return records.filter((record) => record.date.slice(0, 4) === value);
  const { year, startMonth, endMonth } = quarterMonthRange(value);
  return records.filter((record) => {
    const [recordYear, recordMonth] = record.date.split("-").map(Number);
    return recordYear === year && recordMonth >= startMonth && recordMonth <= endMonth;
  });
}

function periodLabel(type: PeriodType, value: string) {
  if (type === "month") return monthLabel(value);
  if (type === "year") return `${value} 年`;
  const [yearStr, quarterStr] = value.split("-Q");
  return `${yearStr} 年 第 ${quarterStr} 季`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatHours(value: number) {
  return `${Number(value.toFixed(2)).toLocaleString("zh-TW")} 小時`;
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function uniqueId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function RecordDialog({
  open,
  onOpenChange,
  settings,
  record,
  records,
  clockTimes,
  initialDate,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  record: WorkRecord | null;
  records: WorkRecord[];
  clockTimes: ClockTimes | null;
  initialDate: string | null;
  onSave: (record: WorkRecord) => Promise<void>;
}) {
  const [draft, setDraft] = useState<RecordDraft>(() => {
    if (record) return draftFromRecord(record);
    const fresh = emptyDraft(settings);
    if (initialDate) {
      fresh.date = initialDate;
      fresh.endDate = initialDate;
    }
    if (clockTimes) {
      fresh.date = clockTimes.date;
      fresh.endDate = clockTimes.endDate;
      fresh.startTime = clockTimes.start;
      fresh.endTime = clockTimes.end;
    }
    return fresh;
  });

  const [saving, setSaving] = useState(false);
  const previewRecord = recordFromDraft(draft, settings, records, record);
  const hours = { regularHours: previewRecord.regularHours, overtimeHours: previewRecord.overtimeHours };
  const preview = recordPay(previewRecord);

  function update<K extends keyof RecordDraft>(key: K, value: RecordDraft[K]) {
    setDraft((current) => {
      if (key === "date" && value && current.date && current.endDate) {
        const days = Math.round((Date.parse(`${current.endDate}T00:00:00Z`) - Date.parse(`${current.date}T00:00:00Z`)) / 86_400_000);
        return { ...current, date: value, endDate: addDays(value, days) };
      }
      return { ...current, [key]: value };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const result = recordSchema.safeParse({ ...previewRecord, id: record?.id ?? uniqueId() });
    if (!result.success) {
      toast.error("請確認日期、時薪與工時皆已正確填寫");
      return;
    }
    setSaving(true);
    try {
      await onSave(result.data);
    } catch (error) {
      saveError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{record ? "編輯工時" : clockTimes ? "確認下班紀錄" : "新增工時"}</DialogTitle>
          <DialogDescription>
            加班時數留白時，會把這筆超過 {record?.regularHoursPerDay ?? settings.regularHoursPerDay} 小時的部分列為加班，同日其他紀錄分開計算。填入數值則維持手動指定。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="field-group">
            <label className="field-label" htmlFor="record-date">日期</label>
            <Input id="record-date" type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} required />
          </div>

          <Tabs value={draft.entryMode} onValueChange={(value) => update("entryMode", value as EntryMode)}>
            <TabsList className="grid h-11 w-full grid-cols-2 bg-slate-100 p-1">
              <TabsTrigger value="time">上下班時間</TabsTrigger>
              <TabsTrigger value="hours">直接填時數</TabsTrigger>
            </TabsList>
            <TabsContent value="time" className="pt-4">
              <div className="grid gap-8 sm:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_130px]">
                <div className="field-group sm:col-span-3">
                  <label className="field-label" htmlFor="end-date">下班日期</label>
                  <Input id="end-date" type="date" min={draft.date} value={draft.endDate} onChange={(event) => update("endDate", event.target.value)} required />
                  <p className="text-xs text-slate-500">同日的下班時間早於上班時，會自動視為隔日。超過一天的班次請選擇實際下班日期。</p>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="start-time">上班</label>
                  <Input id="start-time" type="time" className="min-w-[160px]" value={draft.startTime} onChange={(event) => update("startTime", event.target.value)} required />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="end-time">下班</label>
                  <Input id="end-time" type="time" className="min-w-[160px]" value={draft.endTime} onChange={(event) => update("endTime", event.target.value)} required />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="break-minutes">休息（分鐘）</label>
                  <Input id="break-minutes" type="number" min="0" step="5" value={draft.breakMinutes} onChange={(event) => update("breakMinutes", event.target.value)} />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="hours" className="pt-4">
              <div className="field-group">
                <label className="field-label" htmlFor="total-hours">當日總工時</label>
                <Input id="total-hours" type="number" min="0" step="0.25" value={draft.totalHours} onChange={(event) => update("totalHours", event.target.value)} required />
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="field-group">
              <label className="field-label" htmlFor="hourly-rate">時薪</label>
              <Input id="hourly-rate" type="number" min="0" step="1" inputMode="decimal" value={draft.hourlyRate} onChange={(event) => update("hourlyRate", event.target.value)} required />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="overtime-hours">加班時數</label>
              <Input id="overtime-hours" type="number" min="0" step="0.25" placeholder="留白自動計算" value={draft.overtimeHours} onChange={(event) => update("overtimeHours", event.target.value)} />
            </div>
            <div className="field-group">
              <label className="field-label">加班倍率</label>
              <Select value={draft.overtimeMultiplier} onValueChange={(value) => update("overtimeMultiplier", value)}>
                <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1.34">1.34 倍</SelectItem>
                  <SelectItem value="1.67">1.67 倍</SelectItem>
                  <SelectItem value="2">2 倍</SelectItem>
                  <SelectItem value="2.67">2.67 倍</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field-group">
              <label className="field-label" htmlFor="allowance">津貼／其他加減項</label>
              <Input id="allowance" type="number" step="1" value={draft.allowance} onChange={(event) => update("allowance", event.target.value)} />
            </div>
            <div className="field-group sm:row-span-2">
              <label className="field-label" htmlFor="record-note">備註</label>
              <Textarea id="record-note" rows={3} placeholder="例如：晚班、交通津貼" value={draft.note} onChange={(event) => update("note", event.target.value)} />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950 p-4 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">本筆預估薪資</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(preview)}</p>
              </div>
              <div className="text-right text-sm leading-6 text-slate-300">
                <p>一般 {Number(hours.regularHours.toFixed(2))} 小時</p>
                <p>加班 {Number(hours.overtimeHours.toFixed(2))} 小時</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={saving} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"><Check /> {saving ? "儲存中…" : "儲存紀錄"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
  onExport,
  onImport,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onSave: (settings: Settings) => Promise<void>;
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(parseSettings(draft));
    } catch {
      toast.error("無法儲存：請檢查設定值與瀏覽器儲存空間");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>設定與備份</DialogTitle>
          <DialogDescription>這些預設值會套用到之後新增的工時紀錄。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-6">
          <section>
            <h3 className="section-kicker">薪資設定</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="field-group">
                <label className="field-label" htmlFor="setting-rate">預設時薪</label>
                <Input id="setting-rate" type="number" min="1" value={draft.hourlyRate} onChange={(event) => update("hourlyRate", Number(event.target.value))} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="setting-hours">每日正常工時</label>
                <Input id="setting-hours" type="number" min="0.25" step="0.25" value={draft.regularHoursPerDay} onChange={(event) => update("regularHoursPerDay", Number(event.target.value))} />
              </div>
              <div className="field-group">
                <label className="field-label">預設加班倍率</label>
                <Select value={String(draft.defaultOvertimeMultiplier)} onValueChange={(value) => update("defaultOvertimeMultiplier", Number(value))}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1.34">1.34 倍</SelectItem>
                    <SelectItem value="1.67">1.67 倍</SelectItem>
                    <SelectItem value="2">2 倍</SelectItem>
                    <SelectItem value="2.67">2.67 倍</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="setting-break">預設休息（分鐘）</label>
                <Input id="setting-break" type="number" min="0" step="5" value={draft.defaultBreakMinutes} onChange={(event) => update("defaultBreakMinutes", Number(event.target.value))} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="setting-start">預設上班</label>
                <Input id="setting-start" type="time" value={draft.defaultStart} onChange={(event) => update("defaultStart", event.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="setting-end">預設下班</label>
                <Input id="setting-end" type="time" value={draft.defaultEnd} onChange={(event) => update("defaultEnd", event.target.value)} />
              </div>
            </div>
          </section>

          <section className="border-t border-slate-200 pt-5">
            <h3 className="section-kicker">資料備份</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">資料只存在這台裝置。換手機、換瀏覽器或清除網站資料前，請先匯出備份。</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button type="button" variant="outline" className="justify-start" onClick={onExport}><Download /> 匯出 JSON 備份</Button>
              <Button type="button" variant="outline" className="justify-start" onClick={() => fileInput.current?.click()}><Upload /> 匯入 JSON 備份</Button>
              <Input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onImport(file);
                  event.target.value = "";
                }}
              />
            </div>
          </section>

          <section className="border-t border-slate-200 pt-5">
            <Button type="button" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onClear}><Trash2 /> 清除所有工時紀錄</Button>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={saving} className="bg-slate-950 text-white hover:bg-slate-800">{saving ? "儲存中…" : "儲存設定"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  open,
  onOpenChange,
  records,
  onEdit,
  onDeleteRequest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: WorkRecord[];
  onEdit: (record: WorkRecord) => void;
  onDeleteRequest: (record: WorkRecord) => void;
}) {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [monthValue, setMonthValue] = useState(() => currentMonthString());
  const [quarterValue, setQuarterValue] = useState(() => currentQuarterString());
  const [yearValue, setYearValue] = useState(() => currentYearOnlyString());

  const periodValue = periodType === "month" ? monthValue : periodType === "quarter" ? quarterValue : yearValue;

  function shiftPeriod(amount: number) {
    if (periodType === "month") setMonthValue((value) => changeMonth(value, amount));
    else if (periodType === "quarter") setQuarterValue((value) => changeQuarter(value, amount));
    else setYearValue((value) => changeYearOnly(value, amount));
  }

  function goToCurrentPeriod() {
    setMonthValue(currentMonthString());
    setQuarterValue(currentQuarterString());
    setYearValue(currentYearOnlyString());
  }

  const periodRecords = useMemo(
    () => recordsInPeriod(records, periodType, periodValue),
    [records, periodType, periodValue],
  );
  const sorted = useMemo(
    () => [...periodRecords].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [periodRecords],
  );
  const periodSummary = useMemo(
    () => sorted.reduce(
      (total, record) => ({
        regularHours: total.regularHours + record.regularHours,
        overtimeHours: total.overtimeHours + record.overtimeHours,
        pay: total.pay + recordPay(record),
      }),
      { regularHours: 0, overtimeHours: 0, pay: 0 },
    ),
    [sorted],
  );

  const groups = useMemo(() => {
    if (periodType === "month") return [{ label: "", items: sorted }];
    const map = new Map<string, WorkRecord[]>();
    sorted.forEach((record) => {
      const key = record.date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(record);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ label: monthLabel(key), items }));
  }, [sorted, periodType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-h-[88vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>工時明細</DialogTitle>
          <DialogDescription>選擇月、季或年，查看該期間完整的工時與薪資紀錄。</DialogDescription>
        </DialogHeader>

        <Tabs value={periodType} onValueChange={(value) => setPeriodType(value as PeriodType)}>
          <TabsList className="grid h-11 w-full grid-cols-3 bg-slate-100 p-1">
            <TabsTrigger value="month">月</TabsTrigger>
            <TabsTrigger value="quarter">季</TabsTrigger>
            <TabsTrigger value="year">年</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{periodLabel(periodType, periodValue)}</h3>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <Button variant="ghost" size="icon-sm" aria-label="上一期" onClick={() => shiftPeriod(-1)}><ArrowLeft /></Button>
            <Button variant="ghost" size="sm" className="hidden px-3 sm:flex" onClick={goToCurrentPeriod}>本期</Button>
            <Button variant="ghost" size="icon-sm" aria-label="下一期" onClick={() => shiftPeriod(1)}><ArrowRight /></Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200">
          <div className="bg-white p-4"><p className="text-xs text-slate-500">總薪資</p><p className="mt-1 truncate text-lg font-bold">{formatCurrency(periodSummary.pay)}</p></div>
          <div className="bg-white p-4"><p className="text-xs text-slate-500">一般工時</p><p className="mt-1 text-lg font-bold">{Number(periodSummary.regularHours.toFixed(1))} hr</p></div>
          <div className="bg-white p-4"><p className="text-xs text-slate-500">加班</p><p className="mt-1 text-lg font-bold text-emerald-600">{Number(periodSummary.overtimeHours.toFixed(1))} hr</p></div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-100">
          {sorted.length === 0 ? (
            <div className="flex h-full min-h-40 flex-col items-center justify-center px-6 py-10 text-center text-slate-500">
              <History className="size-6 text-slate-300" />
              <p className="mt-3 text-sm">這段期間還沒有工時紀錄</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label || "current-month"}>
                {group.label && (
                  <p className="sticky top-0 z-10 bg-slate-50 px-5 py-2 text-xs font-semibold text-slate-500 sm:px-6">{group.label}</p>
                )}
                <div className="divide-y divide-slate-100">
                  {group.items.map((record) => (
                    <RecordRow key={record.id} record={record} onEdit={() => onEdit(record)} onDeleteRequest={() => onDeleteRequest(record)} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CalendarView({
  month,
  records,
  selectedDate,
  onSelectDate,
  onAdd,
  onEdit,
  onDeleteRequest,
}: {
  month: string;
  records: WorkRecord[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onAdd: (date: string) => void;
  onEdit: (record: WorkRecord) => void;
  onDeleteRequest: (record: WorkRecord) => void;
}) {
  const today = localDateString();
  const year = Number(month.slice(0, 4));
  const activeDate = selectedDate?.startsWith(month) ? selectedDate : null;
  const dayTotals = useMemo(() => monthDayTotals(records, month), [records, month]);

  const monthTotal = useMemo(
    () => Array.from(dayTotals.values()).reduce(
      (total, day) => ({ hours: total.hours + day.hours, pay: total.pay + day.pay }),
      { hours: 0, pay: 0 },
    ),
    [dayTotals],
  );

  const activeDay = activeDate ? dayTotals.get(activeDate) : undefined;
  const activeRecords = useMemo(() => sortDayRecords(activeDay?.records ?? []), [activeDay]);

  function dayLabel(date: string) {
    const [, m, d] = date.split("-").map(Number);
    const weekday = WEEKDAY_LABELS[new Date(year, m - 1, d).getDay()];
    return `${m} 月 ${d} 日（週${weekday}）`;
  }

  const cells = monthCells(month);

  return (
    <section className="grid gap-4 lg:grid-cols-[1.45fr_0.85fr]">
      <article className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm sm:p-6">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200">
          <div className="bg-white p-3 sm:p-4"><p className="text-xs text-slate-500">本月薪資</p><p className="mt-1 truncate text-base font-bold sm:text-lg">{formatCurrency(monthTotal.pay)}</p></div>
          <div className="bg-white p-3 sm:p-4"><p className="text-xs text-slate-500">總工時</p><p className="mt-1 text-base font-bold sm:text-lg">{Number(monthTotal.hours.toFixed(1))} hr</p></div>
          <div className="bg-white p-3 sm:p-4"><p className="text-xs text-slate-500">上班天數</p><p className="mt-1 text-base font-bold sm:text-lg">{dayTotals.size} 天</p></div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 sm:gap-2">
          {["一", "二", "三", "四", "五", "六", "日"].map((label) => <span key={label} className="py-1">{label}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
          {cells.map((date, index) => {
            if (!date) return <div key={`blank-${index}`} />;
            const day = dayTotals.get(date);
            const selected = date === activeDate;
            const isToday = date === today;
            const label = day
              ? `${dayLabel(date)}，${formatHours(day.hours)}，${formatCurrency(day.pay)}`
              : `${dayLabel(date)}，沒有紀錄`;
            return (
              <button
                key={date}
                type="button"
                aria-label={label}
                aria-pressed={selected}
                onClick={() => onSelectDate(date)}
                className={`flex min-h-16 min-w-0 flex-col items-start rounded-xl px-1 py-1.5 text-left transition sm:min-h-24 sm:p-2.5 ${
                  selected ? "bg-slate-950 text-white" : day ? "bg-emerald-50 text-slate-900 hover:bg-emerald-100" : "text-slate-700 hover:bg-slate-50"
                } ${isToday && !selected ? "ring-2 ring-emerald-400" : ""}`}
              >
                <span className="text-xs font-semibold sm:text-sm">{Number(date.slice(-2))}</span>
                {day && (
                  <span className="mt-auto w-full min-w-0">
                    <span className="flex items-center gap-1 text-[11px] font-semibold tabular-nums sm:text-sm">
                      {Number(day.hours.toFixed(1))}h
                      {day.overtimeHours > 0 && <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />}
                    </span>
                    <span className={`block truncate text-[11px] tabular-nums sm:hidden ${selected ? "text-slate-300" : "text-emerald-700"}`}>{formatCompactCurrency(day.pay)}</span>
                    <span className={`hidden truncate text-sm tabular-nums sm:block ${selected ? "text-slate-300" : "text-emerald-700"}`}>{formatCurrency(day.pay)}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-400" /> 有加班</span>
          <span className="flex items-center gap-1.5"><span className="size-3 rounded ring-2 ring-inset ring-emerald-400" /> 今天</span>
        </div>
      </article>

      <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        {activeDate ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
              <div><p className="section-kicker">當日紀錄</p><h2 className="mt-1 text-lg font-bold">{dayLabel(activeDate)}</h2></div>
              <Button variant="ghost" size="sm" onClick={() => onAdd(activeDate)}><Plus /> 新增</Button>
            </div>
            {activeDay ? (
              <>
                <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100">
                  <div className="bg-white px-5 py-4 sm:px-6"><p className="text-xs text-slate-500">工時</p><p className="mt-1 text-lg font-bold">{formatHours(activeDay.hours)}</p>{activeDay.overtimeHours > 0 && <p className="text-xs text-amber-700">含加班 {Number(activeDay.overtimeHours.toFixed(2))}h</p>}</div>
                  <div className="bg-white px-5 py-4 sm:px-6"><p className="text-xs text-slate-500">當日薪資</p><p className="mt-1 text-lg font-bold text-emerald-600">{formatCurrency(activeDay.pay)}</p></div>
                </div>
                <div className="divide-y divide-slate-100">
                  {activeRecords.map((record) => (
                    <RecordRow key={record.id} record={record} onEdit={() => onEdit(record)} onDeleteRequest={() => onDeleteRequest(record)} />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
                <p className="text-sm text-slate-500">這天沒有工時紀錄</p>
                <Button variant="outline" className="mt-4" onClick={() => onAdd(activeDate)}><Plus /> 新增這天的工時</Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><CalendarDays className="size-6" /></div>
            <p className="mt-4 text-sm text-slate-500">點選日期，查看當天的工時與薪資</p>
          </div>
        )}
      </article>
    </section>
  );
}

export default function Home() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [loadIssue, setLoadIssue] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [view, setView] = useState<"overview" | "calendar">("overview");
  const [selectedDate, setSelectedDate] = useState<string | null>(() => localDateString());
  const [newRecordDate, setNewRecordDate] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [recordOpen, setRecordOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<WorkRecord | null>(null);
  const [clockTimes, setClockTimes] = useState<ClockTimes | null>(null);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const currentState = useRef(DEFAULT_STATE);
  const loaded = useRef(false);
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());

  function commitState(update: (current: AppState) => AppState, replace = false): Promise<void> {
    const operation = mutationQueue.current.then(async () => {
      if (!loaded.current && !replace) throw new Error("原有資料尚未讀取成功，請重新整理或匯入有效備份");
      const saved = replace
        ? await stateStorage.replace(update(currentState.current))
        : await stateStorage.update(update, currentState.current);
      currentState.current = saved;
      loaded.current = true;
      setLoadIssue(null);
      setState(saved);
    });
    mutationQueue.current = operation.catch(() => undefined);
    return operation;
  }

  useEffect(() => {
    let active = true;
    stateStorage.load().then((saved) => {
      if (!active) return;
      currentState.current = saved;
      loaded.current = true;
      setState(saved);
      setSelectedMonth(currentMonthString());
      setReady(true);
    }).catch((error) => {
      if (!active) return;
      setLoadIssue(error instanceof Error ? error.message : "無法讀取裝置資料");
      setSelectedMonth(currentMonthString());
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Keep this tab in step when another tab (or the installed app) saves.
  useEffect(() => stateStorage.subscribe((latest) => {
    if (loaded.current && latest.updatedAt <= currentState.current.updatedAt) return;
    currentState.current = latest;
    loaded.current = true;
    setLoadIssue(null);
    setState(latest);
  }), []);

  useEffect(() => {
    if (!state.activeShift) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [state.activeShift]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    }
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  const monthlyRecords = useMemo(
    () => state.records.filter((record) => record.date.startsWith(selectedMonth)),
    [state.records, selectedMonth],
  );

  const summary = useMemo(
    () => monthlyRecords.reduce(
      (total, record) => ({
        regularHours: total.regularHours + record.regularHours,
        overtimeHours: total.overtimeHours + record.overtimeHours,
        allowance: total.allowance + record.allowance,
        pay: total.pay + recordPay(record),
      }),
      { regularHours: 0, overtimeHours: 0, allowance: 0, pay: 0 },
    ),
    [monthlyRecords],
  );

  const sortedRecords = useMemo(
    () => [...monthlyRecords].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [monthlyRecords],
  );

  const weeklyBars = useMemo(() => {
    if (!selectedMonth) return [];
    const labels = ["一", "二", "三", "四", "五", "六", "日"];
    const weekdays = labels.map((label) => ({ label, hours: 0 }));
    monthlyRecords.forEach((record) => {
      const [year, month, day] = record.date.split("-").map(Number);
      const weekdayIndex = (new Date(year, month - 1, day).getDay() + 6) % 7;
      weekdays[weekdayIndex].hours += record.regularHours + record.overtimeHours;
    });
    return weekdays;
  }, [monthlyRecords, selectedMonth]);

  const maxWeekHours = Math.max(1, ...weeklyBars.map((week) => week.hours));
  const elapsed = state.activeShift ? now - new Date(state.activeShift.startedAt).getTime() : 0;
  const activeEstimatedHours = state.activeShift ? Math.max(0, elapsed / 3_600_000 - state.settings.defaultBreakMinutes / 60) : 0;
  const activeEstimatedPay = state.activeShift ? recordPay(recordFromDraft({
    ...emptyDraft(state.settings, "hours"),
    date: localDateString(new Date(state.activeShift.startedAt)),
    totalHours: String(activeEstimatedHours),
  }, state.settings, state.records)) : 0;

  // In the calendar, the general "新增工時" buttons add to the selected day.
  const calendarDate = view === "calendar" && selectedDate?.startsWith(selectedMonth) ? selectedDate : null;
  const addButtonLabel = calendarDate
    ? `新增 ${Number(calendarDate.slice(5, 7))}/${Number(calendarDate.slice(8))} 工時`
    : "新增工時";

  function openNewRecord(date: string | null = null) {
    setEditingRecord(null);
    setClockTimes(null);
    setNewRecordDate(date);
    setRecordOpen(true);
  }

  function editRecord(record: WorkRecord) {
    setEditingRecord(record);
    setClockTimes(null);
    setNewRecordDate(null);
    setRecordOpen(true);
  }

  async function saveRecord(record: WorkRecord) {
    await commitState((current) => ({
      ...current,
      activeShift: clockTimes ? null : current.activeShift,
      records: recalculateRecords(current.records.some((item) => item.id === record.id)
        ? current.records.map((item) => (item.id === record.id ? record : item))
        : [...current.records, record], current.settings.regularHoursPerDay),
    }));
    setRecordOpen(false);
    setEditingRecord(null);
    setClockTimes(null);
    setNewRecordDate(null);
    setSelectedMonth(record.date.slice(0, 7));
    setSelectedDate(record.date);
    toast.success(editingRecord ? "工時紀錄已更新" : "工時紀錄已儲存");
  }

  async function beginShift() {
    const startedAt = new Date().toISOString();
    try {
      await commitState((current) => ({ ...current, activeShift: current.activeShift ?? { startedAt } }));
      setNow(Date.now());
      toast.success("已開始計時");
    } catch (error) {
      saveError(error);
    }
  }

  function finishShift() {
    if (!state.activeShift) return;
    const start = new Date(state.activeShift.startedAt);
    const end = new Date();
    setClockTimes({ start: localTimeString(start), end: localTimeString(end), date: localDateString(start), endDate: localDateString(end) });
    setEditingRecord(null);
    setNewRecordDate(null);
    setRecordOpen(true);
  }

  async function cancelShift() {
    try {
      await commitState((current) => ({ ...current, activeShift: null }));
      toast("本次計時已取消");
    } catch (error) {
      saveError(error);
    }
  }

  async function deleteRecord(record: WorkRecord) {
    try {
      await commitState((current) => ({ ...current, records: recalculateRecords(current.records.filter((item) => item.id !== record.id), current.settings.regularHoursPerDay) }));
      toast.success("紀錄已刪除");
    } catch (error) {
      saveError(error);
    }
  }

  async function clearRecords() {
    try {
      await commitState((current) => ({ ...current, records: [] }));
      setSettingsOpen(false);
      toast.success("所有工時紀錄已清除");
    } catch (error) {
      saveError(error);
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `salary-backup-${localDateString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("備份檔已下載");
  }

  async function importData(file: File) {
    let imported: AppState;
    try {
      imported = parseState(JSON.parse(await file.text()));
    } catch {
      toast.error("無法匯入：備份格式、日期或工時欄位無效，現有資料未變更");
      return;
    }
    try {
      await commitState(() => imported, true);
      setSelectedMonth(currentMonthString());
      setSettingsOpen(false);
      toast.success(`已匯入 ${imported.records.length} 筆工時紀錄`);
    } catch (error) {
      saveError(error);
    }
  }

  async function installApp() {
    if (!installPrompt) return;
    const promptEvent = installPrompt as Event & { prompt: () => Promise<void> };
    await promptEvent.prompt();
    setInstallPrompt(null);
  }

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-6 text-slate-950">
        <div className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-200"><WalletCards className="size-6" /></div>
          <p className="mt-4 text-sm font-medium text-slate-500">正在讀取你的工時資料…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-slate-100/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-slate-950 text-emerald-400"><WalletCards className="size-[18px]" /></div>
            <div>
              <p className="text-base font-bold leading-none tracking-tight">薪時記</p>
              <p className="mt-1 text-xs text-slate-500">薪資與工時</p>
            </div>
          </div>
          <Tabs value={view} onValueChange={(value) => setView(value as "overview" | "calendar")}>
            <TabsList className="h-9 bg-slate-200/70 p-1">
              <TabsTrigger value="overview" className="px-3">總覽</TabsTrigger>
              <TabsTrigger value="calendar" className="px-3">日曆</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            {installPrompt && <Button variant="outline" size="sm" className="hidden bg-white sm:flex" onClick={installApp}><Smartphone /> 安裝 App</Button>}
            <Button variant="outline" size="icon" className="bg-white" aria-label="設定" onClick={() => setSettingsOpen(true)}><Settings2 /></Button>
            <Button className="hidden bg-slate-950 text-white hover:bg-slate-800 sm:flex" onClick={() => openNewRecord(calendarDate)}><Plus /> {addButtonLabel}</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pb-10 lg:px-8">
        {loadIssue && (
          <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{loadIssue}。重新整理成功前，現有資料不會被新增或修改的操作覆蓋。</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>重新讀取</Button>
          </div>
        )}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="section-kicker">{view === "calendar" ? "工時日曆" : "本月總覽"}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{monthLabel(selectedMonth)}</h1>
          </div>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <Button variant="ghost" size="icon-sm" aria-label="上個月" onClick={() => setSelectedMonth(changeMonth(selectedMonth, -1))}><ArrowLeft /></Button>
            <Button variant="ghost" size="sm" className="hidden px-3 sm:flex" onClick={() => setSelectedMonth(currentMonthString())}>本月</Button>
            <Button variant="ghost" size="icon-sm" aria-label="下個月" onClick={() => setSelectedMonth(changeMonth(selectedMonth, 1))}><ArrowRight /></Button>
          </div>
        </div>

        {view === "calendar" ? (
          <CalendarView
            month={selectedMonth}
            records={monthlyRecords}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onAdd={openNewRecord}
            onEdit={editRecord}
            onDeleteRequest={setDeleteTarget}
          />
        ) : (
        <>
        <section className="grid gap-4 lg:grid-cols-[1.45fr_0.85fr]">
          <article className="relative overflow-hidden rounded-[28px] bg-slate-950 p-6 text-white shadow-xl shadow-slate-300/60 sm:p-8">
            <div className="absolute -right-16 -top-24 size-64 rounded-full bg-emerald-400/15 blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-300"><Banknote className="size-4 text-emerald-400" /> 預估薪資</p>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{monthlyRecords.length} 筆紀錄</span>
              </div>
              <p className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{formatCurrency(summary.pay)}</p>
              <p className="mt-3 text-sm text-slate-400">依已輸入的時薪、加班倍率與津貼估算</p>

              <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-white/10">
                <div className="bg-white/[0.04] p-4"><p className="text-xs text-slate-400">一般工時</p><p className="mt-2 text-lg font-semibold">{Number(summary.regularHours.toFixed(1))}<span className="ml-1 text-xs font-normal text-slate-400">hr</span></p></div>
                <div className="bg-white/[0.04] p-4"><p className="text-xs text-slate-400">加班</p><p className="mt-2 text-lg font-semibold text-emerald-300">{Number(summary.overtimeHours.toFixed(1))}<span className="ml-1 text-xs font-normal text-slate-400">hr</span></p></div>
                <div className="bg-white/[0.04] p-4"><p className="text-xs text-slate-400">津貼</p><p className="mt-2 truncate text-lg font-semibold">{formatCurrency(summary.allowance)}</p></div>
              </div>
            </div>
          </article>

          <article className={`rounded-[28px] border p-6 shadow-sm ${state.activeShift ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center justify-between">
              <div><p className="section-kicker">今日打卡</p><h2 className="mt-1 text-xl font-bold">{state.activeShift ? "工作計時中" : "準備上班了嗎？"}</h2></div>
              <div className={`grid size-11 place-items-center rounded-2xl ${state.activeShift ? "bg-emerald-400 text-slate-950" : "bg-slate-100 text-slate-500"}`}><AlarmClock className="size-5" /></div>
            </div>

            {state.activeShift ? (
              <div className="mt-7">
                <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums">{formatElapsed(elapsed)}</p>
                <div className="mt-3 flex items-center justify-between text-sm text-slate-600"><span>開始 {localTimeString(new Date(state.activeShift.startedAt))}</span><span>目前約 {formatCurrency(activeEstimatedPay)}</span></div>
                <div className="mt-6 flex gap-2">
                  <Button className="h-11 flex-1 bg-slate-950 text-white hover:bg-slate-800" onClick={finishShift}><Square className="fill-current" /> 下班並儲存</Button>
                  <Button variant="outline" size="icon-lg" className="bg-white" aria-label="取消本次計時" onClick={cancelShift}><X /></Button>
                </div>
              </div>
            ) : (
              <div className="mt-7">
                <p className="text-sm leading-6 text-slate-500">按下開始後可關閉頁面，回來時仍會繼續計時。</p>
                <Button className="mt-6 h-12 w-full bg-emerald-400 text-base font-bold text-slate-950 hover:bg-emerald-300" onClick={beginShift}><Play className="fill-current" /> 開始上班</Button>
              </div>
            )}
          </article>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.45fr]">
          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between"><div><p className="section-kicker">工時分布</p><h2 className="mt-1 text-lg font-bold">每週累計</h2></div><Clock3 className="size-5 text-slate-400" /></div>
            <div className="mt-7 flex h-36 items-end gap-3" aria-label="每週工時長條圖">
              {weeklyBars.map((week) => (
                <div key={week.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-xs font-semibold text-slate-600">{Number(week.hours.toFixed(1))}</span>
                  <div className="flex h-24 w-full items-end overflow-hidden rounded-lg bg-slate-100">
                    <div className="w-full rounded-lg bg-emerald-400 transition-all duration-500" style={{ height: `${Math.max(week.hours > 0 ? 8 : 0, (week.hours / maxWeekHours) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-slate-400">{week.label}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
              <div><p className="section-kicker">工時紀錄</p><h2 className="mt-1 text-lg font-bold">{sortedRecords.length ? "最近輸入" : "尚無紀錄"}</h2></div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}><History /> 明細</Button>
                <Button variant="ghost" size="sm" onClick={() => openNewRecord()}><Plus /> 新增</Button>
              </div>
            </div>

            {sortedRecords.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
                <div className="grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><History className="size-6" /></div>
                <p className="mt-4 font-semibold">從第一筆工時開始</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">可以直接輸入時數，或記錄上下班時間讓系統自動計算。</p>
                <Button variant="outline" className="mt-5" onClick={() => openNewRecord()}><Plus /> 新增第一筆</Button>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {sortedRecords.slice(0, 3).map((record) => (
                    <RecordRow key={record.id} record={record} onEdit={() => editRecord(record)} onDeleteRequest={() => setDeleteTarget(record)} />
                  ))}
                </div>
                {sortedRecords.length > 3 && (
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1 border-t border-slate-100 px-5 py-3 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 sm:px-6"
                    onClick={() => setHistoryOpen(true)}
                  >
                    查看全部 {sortedRecords.length} 筆 <ChevronRight className="size-4" />
                  </button>
                )}
              </>
            )}
          </article>
        </section>
        </>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> 資料只存在你的裝置</span>
          <span className="flex items-center gap-1.5"><CloudOff className="size-3.5" /> 不需登入</span>
          <button className="flex items-center gap-1.5 underline-offset-4 hover:text-slate-600 hover:underline" onClick={() => setSettingsOpen(true)}><FileJson className="size-3.5" /> 備份與還原</button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:hidden">
        <Button className="h-12 w-full bg-slate-950 text-base text-white hover:bg-slate-800" onClick={() => openNewRecord(calendarDate)}><Plus /> {addButtonLabel}</Button>
      </div>

      {recordOpen && (
        <RecordDialog
          open
          onOpenChange={(open) => {
            setRecordOpen(open);
            if (!open) { setEditingRecord(null); setClockTimes(null); setNewRecordDate(null); }
          }}
          settings={state.settings}
          record={editingRecord}
          records={state.records}
          clockTimes={clockTimes}
          initialDate={newRecordDate}
          onSave={saveRecord}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          open
          onOpenChange={setSettingsOpen}
          settings={state.settings}
          onSave={async (settings) => {
            await commitState((current) => ({ ...current, settings }));
            setSettingsOpen(false);
            toast.success("設定已儲存");
          }}
          onExport={exportData}
          onImport={importData}
          onClear={() => setClearOpen(true)}
        />
      )}

      {historyOpen && (
        <HistoryDialog
          open
          onOpenChange={setHistoryOpen}
          records={state.records}
          onEdit={editRecord}
          onDeleteRequest={(record) => setDeleteTarget(record)}
        />
      )}

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清除所有工時紀錄？</AlertDialogTitle>
            <AlertDialogDescription>這會刪除 {state.records.length} 筆紀錄，且無法復原。建議先匯出備份。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={clearRecords}>清除紀錄</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這筆工時紀錄？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `${deleteTarget.date} · ${formatHours(deleteTarget.regularHours + deleteTarget.overtimeHours)}，刪除後無法復原。` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) deleteRecord(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster position="top-center" richColors />
    </main>
  );
}
