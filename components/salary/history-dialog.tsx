import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { recordPay } from "@/lib/salary";
import type { WorkRecord } from "@/lib/salary";
import { changeMonth, currentMonthString, formatCurrency, monthLabel } from "@/components/salary/helpers";
import { RecordRow } from "@/components/salary/record-row";

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

export function HistoryDialog({
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
