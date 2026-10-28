import { useMemo } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localDateString } from "@/lib/salary";
import type { WorkRecord } from "@/lib/salary";
import { dayTotals as monthDayTotals, formatCompactCurrency, monthCells, sortDayRecords } from "@/lib/calendar";
import { WEEKDAY_LABELS, formatCurrency, formatHours } from "@/components/salary/helpers";
import { RecordRow } from "@/components/salary/record-row";

export function CalendarView({
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
