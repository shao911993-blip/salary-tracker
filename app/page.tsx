"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  AlarmClock,
  ArrowLeft,
  ArrowRight,
  Banknote,
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

type EntryMode = "time" | "hours";

type Settings = {
  hourlyRate: number;
  defaultBreakMinutes: number;
  defaultStart: string;
  defaultEnd: string;
  regularHoursPerDay: number;
  defaultOvertimeMultiplier: number;
};

type WorkRecord = {
  id: string;
  date: string;
  entryMode: EntryMode;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  regularHours: number;
  overtimeHours: number;
  overtimeMultiplier: number;
  hourlyRate: number;
  allowance: number;
  note: string;
  createdAt: string;
};

type ActiveShift = {
  startedAt: string;
};

type AppState = {
  version: 1;
  settings: Settings;
  records: WorkRecord[];
  activeShift: ActiveShift | null;
};

type RecordDraft = {
  date: string;
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

const DEFAULT_SETTINGS: Settings = {
  hourlyRate: 200,
  defaultBreakMinutes: 60,
  defaultStart: "09:00",
  defaultEnd: "18:00",
  regularHoursPerDay: 8,
  defaultOvertimeMultiplier: 1.34,
};

const DEFAULT_STATE: AppState = {
  version: 1,
  settings: DEFAULT_SETTINGS,
  records: [],
  activeShift: null,
};

const DB_NAME = "salary-time-tracker";
const STORE_NAME = "app-state";
const STATE_KEY = "main";
const FALLBACK_KEY = "salary-time-tracker-v1";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadState(): Promise<AppState> {
  try {
    const database = await openDatabase();
    const saved = await new Promise<AppState | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result as AppState | undefined);
      request.onerror = () => reject(request.error);
    });
    database.close();
    if (saved?.version === 1) return normalizeState(saved);
  } catch {
    // Some privacy modes disable IndexedDB. The localStorage mirror is a fallback.
  }

  try {
    const fallback = localStorage.getItem(FALLBACK_KEY);
    if (fallback) return normalizeState(JSON.parse(fallback) as AppState);
  } catch {
    // Ignore invalid or inaccessible fallback data.
  }
  return DEFAULT_STATE;
}

async function saveState(state: AppState): Promise<void> {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // The localStorage mirror above still preserves the user's data.
  }
}

function normalizeState(value: AppState): AppState {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, ...(value.settings ?? {}) },
    records: Array.isArray(value.records) ? value.records : [],
    activeShift: value.activeShift?.startedAt ? value.activeShift : null,
  };
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function minutesBetween(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let difference = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (difference <= 0) difference += 24 * 60;
  return difference;
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

function recordPay(record: WorkRecord) {
  return (
    record.regularHours * record.hourlyRate +
    record.overtimeHours * record.hourlyRate * record.overtimeMultiplier +
    record.allowance
  );
}

function emptyDraft(settings: Settings, mode: EntryMode = "time"): RecordDraft {
  return {
    date: localDateString(),
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

function draftFromRecord(record: WorkRecord): RecordDraft {
  return {
    date: record.date,
    entryMode: record.entryMode,
    startTime: record.startTime,
    endTime: record.endTime,
    breakMinutes: String(record.breakMinutes),
    totalHours: String(record.regularHours + record.overtimeHours),
    overtimeHours: String(record.overtimeHours),
    overtimeMultiplier: String(record.overtimeMultiplier),
    hourlyRate: String(record.hourlyRate),
    allowance: String(record.allowance),
    note: record.note,
  };
}

function draftHours(draft: RecordDraft, settings: Settings) {
  const breakMinutes = Math.max(0, Number(draft.breakMinutes) || 0);
  const totalHours =
    draft.entryMode === "time"
      ? Math.max(0, (minutesBetween(draft.startTime, draft.endTime) - breakMinutes) / 60)
      : Math.max(0, Number(draft.totalHours) || 0);
  const enteredOvertime = draft.overtimeHours.trim();
  const overtimeHours = enteredOvertime
    ? Math.min(totalHours, Math.max(0, Number(enteredOvertime) || 0))
    : Math.max(0, totalHours - settings.regularHoursPerDay);
  return {
    totalHours,
    overtimeHours,
    regularHours: Math.max(0, totalHours - overtimeHours),
  };
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
  clockTimes,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  record: WorkRecord | null;
  clockTimes: { start: string; end: string; date: string } | null;
  onSave: (record: WorkRecord) => void;
}) {
  const [draft, setDraft] = useState<RecordDraft>(() => {
    if (record) return draftFromRecord(record);
    const fresh = emptyDraft(settings);
    if (clockTimes) {
      fresh.date = clockTimes.date;
      fresh.startTime = clockTimes.start;
      fresh.endTime = clockTimes.end;
    }
    return fresh;
  });

  const hours = draftHours(draft, settings);
  const hourlyRate = Math.max(0, Number(draft.hourlyRate) || 0);
  const multiplier = Math.max(0, Number(draft.overtimeMultiplier) || 0);
  const allowance = Number(draft.allowance) || 0;
  const preview =
    hours.regularHours * hourlyRate +
    hours.overtimeHours * hourlyRate * multiplier +
    allowance;

  function update<K extends keyof RecordDraft>(key: K, value: RecordDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.date || hourlyRate <= 0 || hours.totalHours <= 0) {
      toast.error("請確認日期、時薪與工時皆已正確填寫");
      return;
    }
    onSave({
      id: record?.id ?? uniqueId(),
      date: draft.date,
      entryMode: draft.entryMode,
      startTime: draft.entryMode === "time" ? draft.startTime : "",
      endTime: draft.entryMode === "time" ? draft.endTime : "",
      breakMinutes: draft.entryMode === "time" ? Math.max(0, Number(draft.breakMinutes) || 0) : 0,
      regularHours: hours.regularHours,
      overtimeHours: hours.overtimeHours,
      overtimeMultiplier: multiplier,
      hourlyRate,
      allowance,
      note: draft.note.trim(),
      createdAt: record?.createdAt ?? new Date().toISOString(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? "編輯工時" : clockTimes ? "確認下班紀錄" : "新增工時"}</DialogTitle>
          <DialogDescription>
            加班時數留白時，會自動把每日超過 {settings.regularHoursPerDay} 小時的部分列為加班。
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
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="field-group">
                  <label className="field-label" htmlFor="start-time">上班</label>
                  <Input id="start-time" type="time" value={draft.startTime} onChange={(event) => update("startTime", event.target.value)} required />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="end-time">下班</label>
                  <Input id="end-time" type="time" value={draft.endTime} onChange={(event) => update("endTime", event.target.value)} required />
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"><Check /> 儲存紀錄</Button>
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
  onSave: (settings: Settings) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const fileInput = useRef<HTMLInputElement>(null);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.hourlyRate <= 0 || draft.regularHoursPerDay <= 0) {
      toast.error("時薪與每日正常工時必須大於 0");
      return;
    }
    onSave(draft);
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
            <Button type="submit" className="bg-slate-950 text-white hover:bg-slate-800">儲存設定</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Home() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [recordOpen, setRecordOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<WorkRecord | null>(null);
  const [clockTimes, setClockTimes] = useState<{ start: string; end: string; date: string } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  useEffect(() => {
    let active = true;
    loadState().then((saved) => {
      if (!active) return;
      setState(saved);
      setSelectedMonth(currentMonthString());
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timeout = window.setTimeout(() => saveState(state), 120);
    return () => window.clearTimeout(timeout);
  }, [state, ready]);

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
    const [year, month] = selectedMonth.split("-").map(Number);
    const days = new Date(year, month, 0).getDate();
    const weeks = Array.from({ length: Math.ceil(days / 7) }, (_, index) => ({ label: `W${index + 1}`, hours: 0 }));
    monthlyRecords.forEach((record) => {
      const day = Number(record.date.slice(-2));
      weeks[Math.floor((day - 1) / 7)].hours += record.regularHours + record.overtimeHours;
    });
    return weeks;
  }, [monthlyRecords, selectedMonth]);

  const maxWeekHours = Math.max(1, ...weeklyBars.map((week) => week.hours));
  const elapsed = state.activeShift ? now - new Date(state.activeShift.startedAt).getTime() : 0;
  const activeEstimatedHours = state.activeShift ? Math.max(0, elapsed / 3_600_000 - state.settings.defaultBreakMinutes / 60) : 0;
  const activeEstimatedPay =
    Math.min(activeEstimatedHours, state.settings.regularHoursPerDay) * state.settings.hourlyRate +
    Math.max(0, activeEstimatedHours - state.settings.regularHoursPerDay) * state.settings.hourlyRate * state.settings.defaultOvertimeMultiplier;

  function saveRecord(record: WorkRecord) {
    setState((current) => ({
      ...current,
      activeShift: clockTimes ? null : current.activeShift,
      records: current.records.some((item) => item.id === record.id)
        ? current.records.map((item) => (item.id === record.id ? record : item))
        : [...current.records, record],
    }));
    setRecordOpen(false);
    setEditingRecord(null);
    setClockTimes(null);
    setSelectedMonth(record.date.slice(0, 7));
    toast.success(editingRecord ? "工時紀錄已更新" : "工時紀錄已儲存");
  }

  function beginShift() {
    const startedAt = new Date().toISOString();
    setState((current) => ({ ...current, activeShift: { startedAt } }));
    setNow(Date.now());
    toast.success("已開始計時");
  }

  function finishShift() {
    if (!state.activeShift) return;
    const start = new Date(state.activeShift.startedAt);
    const end = new Date();
    setClockTimes({ start: localTimeString(start), end: localTimeString(end), date: localDateString(start) });
    setEditingRecord(null);
    setRecordOpen(true);
  }

  function cancelShift() {
    setState((current) => ({ ...current, activeShift: null }));
    toast("本次計時已取消");
  }

  function deleteRecord(record: WorkRecord) {
    setState((current) => ({ ...current, records: current.records.filter((item) => item.id !== record.id) }));
    toast.success("紀錄已刪除");
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
    try {
      const value = JSON.parse(await file.text()) as AppState;
      if (value.version !== 1 || !Array.isArray(value.records) || !value.settings) throw new Error("Invalid backup");
      const imported = normalizeState(value);
      setState(imported);
      await saveState(imported);
      setSelectedMonth(currentMonthString());
      setSettingsOpen(false);
      toast.success(`已匯入 ${imported.records.length} 筆工時紀錄`);
    } catch {
      toast.error("無法匯入：這不是有效的薪時記備份檔");
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
          <div className="flex items-center gap-2">
            {installPrompt && <Button variant="outline" size="sm" className="hidden bg-white sm:flex" onClick={installApp}><Smartphone /> 安裝 App</Button>}
            <Button variant="outline" size="icon" className="bg-white" aria-label="設定" onClick={() => setSettingsOpen(true)}><Settings2 /></Button>
            <Button className="hidden bg-slate-950 text-white hover:bg-slate-800 sm:flex" onClick={() => { setEditingRecord(null); setClockTimes(null); setRecordOpen(true); }}><Plus /> 新增工時</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pb-10 lg:px-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="section-kicker">本月總覽</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{monthLabel(selectedMonth)}</h1>
          </div>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <Button variant="ghost" size="icon-sm" aria-label="上個月" onClick={() => setSelectedMonth(changeMonth(selectedMonth, -1))}><ArrowLeft /></Button>
            <Button variant="ghost" size="sm" className="hidden px-3 sm:flex" onClick={() => setSelectedMonth(currentMonthString())}>本月</Button>
            <Button variant="ghost" size="icon-sm" aria-label="下個月" onClick={() => setSelectedMonth(changeMonth(selectedMonth, 1))}><ArrowRight /></Button>
          </div>
        </div>

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
              <Button variant="ghost" size="sm" onClick={() => { setEditingRecord(null); setClockTimes(null); setRecordOpen(true); }}><Plus /> 新增</Button>
            </div>

            {sortedRecords.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
                <div className="grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><History className="size-6" /></div>
                <p className="mt-4 font-semibold">從第一筆工時開始</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">可以直接輸入時數，或記錄上下班時間讓系統自動計算。</p>
                <Button variant="outline" className="mt-5" onClick={() => { setEditingRecord(null); setClockTimes(null); setRecordOpen(true); }}><Plus /> 新增第一筆</Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {sortedRecords.slice(0, 8).map((record) => (
                  <div key={record.id} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6">
                    <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-700">{Number(record.date.slice(-2))}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{formatHours(record.regularHours + record.overtimeHours)}</p>
                        {record.overtimeHours > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">加班 {Number(record.overtimeHours.toFixed(2))}h</span>}
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-500">{record.entryMode === "time" ? `${record.startTime}–${record.endTime}` : "手動輸入時數"}{record.note ? ` · ${record.note}` : ""}</p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{formatCurrency(recordPay(record))}</p>
                    <div className="hidden items-center gap-1 group-hover:flex sm:flex sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                      <Button variant="ghost" size="icon-sm" aria-label={`編輯 ${record.date} 紀錄`} onClick={() => { setEditingRecord(record); setClockTimes(null); setRecordOpen(true); }}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" className="text-red-500 hover:bg-red-50 hover:text-red-600" aria-label={`刪除 ${record.date} 紀錄`} onClick={() => deleteRecord(record)}><Trash2 /></Button>
                    </div>
                    <Button variant="ghost" size="icon-sm" className="sm:hidden" aria-label={`編輯 ${record.date} 紀錄`} onClick={() => { setEditingRecord(record); setClockTimes(null); setRecordOpen(true); }}><ChevronRight /></Button>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> 資料只存在你的裝置</span>
          <span className="flex items-center gap-1.5"><CloudOff className="size-3.5" /> 不需登入</span>
          <button className="flex items-center gap-1.5 underline-offset-4 hover:text-slate-600 hover:underline" onClick={() => setSettingsOpen(true)}><FileJson className="size-3.5" /> 備份與還原</button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:hidden">
        <Button className="h-12 w-full bg-slate-950 text-base text-white hover:bg-slate-800" onClick={() => { setEditingRecord(null); setClockTimes(null); setRecordOpen(true); }}><Plus /> 新增工時</Button>
      </div>

      {recordOpen && (
        <RecordDialog
          open
          onOpenChange={(open) => {
            setRecordOpen(open);
            if (!open) { setEditingRecord(null); setClockTimes(null); }
          }}
          settings={state.settings}
          record={editingRecord}
          clockTimes={clockTimes}
          onSave={saveRecord}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          open
          onOpenChange={setSettingsOpen}
          settings={state.settings}
          onSave={(settings) => {
            setState((current) => ({ ...current, settings }));
            setSettingsOpen(false);
            toast.success("設定已儲存");
          }}
          onExport={exportData}
          onImport={importData}
          onClear={() => setClearOpen(true)}
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
            <AlertDialogAction variant="destructive" onClick={() => { setState((current) => ({ ...current, records: [] })); setSettingsOpen(false); toast.success("所有工時紀錄已清除"); }}>清除紀錄</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster position="top-center" richColors />
    </main>
  );
}
