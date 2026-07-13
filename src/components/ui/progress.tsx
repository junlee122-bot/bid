import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "./cn";

export type ProgressTone = "primary" | "success" | "warning" | "danger";

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: string;
  valueLabel?: string;
  tone?: ProgressTone;
  size?: "sm" | "md";
}

const tones: Record<ProgressTone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  {
    value,
    max = 100,
    label,
    valueLabel,
    tone = "primary",
    size = "md",
    className,
    ...props
  },
  ref,
) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = (clamped / safeMax) * 100;

  return (
    <div ref={ref} className={cn("w-full", className)} {...props}>
      {(label || valueLabel) && (
        <div className="mb-2 flex items-center justify-between gap-4 text-xs">
          <span className="font-medium text-muted-foreground">{label}</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {valueLabel ?? `${Math.round(percent)}%`}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        className={cn("w-full overflow-hidden rounded-full bg-muted", size === "sm" ? "h-1" : "h-2")}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", tones[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
});
