import { useState } from "react";
import type { FormEvent } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { addDays, draftFromRecord, emptyDraft, recordFromDraft, recordPay, recordSchema } from "@/lib/salary";
import type { ClockTimes, EntryMode, RecordDraft, Settings, WorkRecord } from "@/lib/salary";
import { formatCurrency, saveError, uniqueId } from "@/components/salary/helpers";

export function RecordDialog({
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
