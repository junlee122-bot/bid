import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  elevated?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive = false, elevated = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-[0_18px_60px_-42px_rgb(0_0_0/0.8)]",
        elevated && "bg-card-elevated shadow-[0_22px_70px_-38px_rgb(0_0_0/0.9)]",
        interactive &&
          "transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_22px_70px_-38px_var(--primary)]",
        className,
      )}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn("flex flex-col gap-1.5 p-5 sm:p-6", className)} {...props} />;
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn("text-base font-semibold tracking-tight text-foreground", className)}
        {...props}
      />
    );
  },
);

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return (
      <p ref={ref} className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />
    );
  },
);

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)} {...props} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-3 border-t border-border px-5 py-4 sm:px-6", className)}
        {...props}
      />
    );
  },
);
