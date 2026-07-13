import type { RiskLevel } from "./domain";

export function formatCompactKrw(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (absolute >= 100_000_000_000) return `${sign}${(absolute / 100_000_000_000).toFixed(1)}천억`;
  if (absolute >= 100_000_000) return `${sign}${(absolute / 100_000_000).toFixed(1)}억`;
  if (absolute >= 10_000) return `${sign}${(absolute / 10_000).toFixed(0)}만`;
  return `${Math.round(amount).toLocaleString("ko-KR")}`;
}

export function formatKrw(value: number): string {
  return `${Math.round(Number.isFinite(value) ? value : 0).toLocaleString("ko-KR")}원`;
}

export function formatPct(value: number, digits = 1): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기준일 미입력";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export const riskMeta: Record<RiskLevel, { label: string; badge: "success" | "primary" | "warning" | "danger"; color: string; softClass: string }> = {
  low: { label: "안정", badge: "success", color: "var(--success)", softClass: "text-success" },
  caution: { label: "관찰", badge: "primary", color: "var(--primary)", softClass: "text-primary" },
  high: { label: "주의", badge: "warning", color: "var(--warning)", softClass: "text-warning" },
  critical: { label: "위험", badge: "danger", color: "var(--destructive)", softClass: "text-red-300" },
};

export function downloadTextFile(filename: string, content: string, type = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
