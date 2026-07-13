import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "./cn";

export const Skeleton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Skeleton(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted/80", className)}
      {...props}
    />
  );
});
