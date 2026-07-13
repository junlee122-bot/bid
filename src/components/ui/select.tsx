import { forwardRef, type SelectHTMLAttributes } from "react";

import { cn } from "./cn";
import { Icon } from "./icons";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, wrapperClassName, invalid = false, children, ...props },
  ref,
) {
  return (
    <span className={cn("relative block w-full", wrapperClassName)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-10 w-full appearance-none rounded-lg border border-border bg-input/60 px-3 pe-9 text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] hover:border-border/90 focus:border-primary/60 focus:bg-input focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50",
          invalid && "border-destructive/70 focus:border-destructive focus:ring-destructive/15",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <Icon
        name="chevronDown"
        size={16}
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
});
