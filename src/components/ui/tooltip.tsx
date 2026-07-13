import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "./cn";

export interface TooltipProps extends HTMLAttributes<HTMLSpanElement> {
  content: string;
}

/** Dependency-free tooltip that delegates focus/hover announcement to native `title`. */
export const Tooltip = forwardRef<HTMLSpanElement, TooltipProps>(function Tooltip(
  { content, className, children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      title={content}
      aria-label={typeof children === "string" ? undefined : content}
      className={cn("inline-flex", className)}
      {...props}
    >
      {children}
    </span>
  );
});
