import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordPay, recordTimeLabel } from "@/lib/salary";
import type { WorkRecord } from "@/lib/salary";
import { WEEKDAY_LABELS, formatCurrency, formatHours } from "@/components/salary/helpers";

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

export function RecordRow({ record, onEdit, onDeleteRequest }: { record: WorkRecord; onEdit: () => void; onDeleteRequest: () => void }) {
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
