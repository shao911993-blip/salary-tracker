import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseSettings } from "@/lib/salary";
import type { Settings } from "@/lib/salary";

export function SettingsDialog({
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
