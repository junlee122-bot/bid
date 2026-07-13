import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "./cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", invalid = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        "flex h-10 w-full rounded-lg border border-border bg-input/60 px-3 py-2 text-sm text-foreground shadow-inner shadow-black/5 outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/70 hover:border-border/90 focus:border-primary/60 focus:bg-input focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "border-destructive/70 focus:border-destructive focus:ring-destructive/15",
        className,
      )}
      {...props}
    />
  );
});
