import { toast } from "sonner";
import { localDateString } from "@/lib/salary";

export function saveError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "儲存失敗，請重試");
}

export function localTimeString(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function currentMonthString(date = new Date()) {
  return localDateString(date).slice(0, 7);
}

export function changeMonth(month: string, amount: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const next = new Date(year, monthIndex - 1 + amount, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  if (!month) return "載入中";
  const [year, monthIndex] = month.split("-");
  return `${year} 年 ${Number(monthIndex)} 月`;
}

export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function formatHours(value: number) {
  return `${Number(value.toFixed(2)).toLocaleString("zh-TW")} 小時`;
}

export function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function uniqueId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
