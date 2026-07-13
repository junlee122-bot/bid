export function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function nonNegative(value: number): number {
  return Math.max(0, finite(value));
}

export function clamp(value: number, min: number, max: number): number {
  const safeMin = finite(min);
  const safeMax = Math.max(safeMin, finite(max, safeMin));
  return Math.min(safeMax, Math.max(safeMin, finite(value, safeMin)));
}

export function round(value: number, digits = 0): number {
  const factor = 10 ** clamp(Math.trunc(digits), 0, 6);
  return Math.round(finite(value) * factor) / factor;
}

export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  const safeDenominator = finite(denominator);
  if (Math.abs(safeDenominator) < Number.EPSILON) return fallback;
  return finite(numerator) / safeDenominator;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + finite(value), 0);
}

export function formatKrw(value: number): string {
  const amount = finite(value);
  const absolute = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (absolute >= 100_000_000) return `${sign}${round(absolute / 100_000_000, 1)}억원`;
  if (absolute >= 10_000) return `${sign}${round(absolute / 10_000, 0).toLocaleString("ko-KR")}만원`;
  return `${sign}${round(absolute).toLocaleString("ko-KR")}원`;
}

export function formatPct(value: number): string {
  return `${round(value, 1).toLocaleString("ko-KR")}%`;
}
