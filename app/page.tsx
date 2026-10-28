"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, ArrowLeft, ArrowRight, Banknote, ChevronRight, Clock3, CloudOff, FileJson, History, Play, Plus, Settings2, ShieldCheck, Smartphone, Square, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_STATE, emptyDraft, localDateString, parseState, recalculateRecords, recordFromDraft, recordPay } from "@/lib/salary";
import type { AppState, ClockTimes, WorkRecord } from "@/lib/salary";
import { stateStorage } from "@/lib/salary-storage";
import { changeMonth, currentMonthString, formatCurrency, formatElapsed, formatHours, localTimeString, monthLabel, saveError } from "@/components/salary/helpers";
import { RecordRow } from "@/components/salary/record-row";
import { RecordDialog } from "@/components/salary/record-dialog";
import { SettingsDialog } from "@/components/salary/settings-dialog";
import { HistoryDialog } from "@/components/salary/history-dialog";
import { CalendarView } from "@/components/salary/calendar-view";

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
