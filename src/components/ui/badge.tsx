import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "./cn";

export type BadgeVariant =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "outline";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const variants: Record<BadgeVariant, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/20 bg-primary/10 text-primary",
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/20 bg-warning/10 text-warning",
  danger: "border-destructive/20 bg-destructive/10 text-red-300",
  outline: "border-border bg-transparent text-foreground",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = "neutral", dot = false, children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold leading-none tracking-tight",
        variants[variant],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
});
