import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../ui/cn";

export interface BrandLogoProps extends HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
  size?: "sm" | "md" | "lg";
  subtitle?: string | false;
}

const markSizes = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
} as const;

export const BrandLogo = forwardRef<HTMLDivElement, BrandLogoProps>(function BrandLogo(
  {
    compact = false,
    size = "md",
    subtitle = "수주 리스크 의사결정 시스템",
    className,
    ...props
  },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-label="BID SHIELD"
      className={cn("inline-flex min-w-0 items-center gap-3", className)}
      {...props}
    >
      <svg
        viewBox="0 0 48 48"
        aria-hidden="true"
        className={cn("shrink-0 drop-shadow-[0_8px_18px_rgb(45_212_191/0.18)]", markSizes[size])}
      >
        <path
          d="M24 3.5 41 10v12.7c0 10.2-6.1 17.3-17 22C13.1 40 7 32.9 7 22.7V10z"
          fill="var(--primary)"
        />
        <path
          d="M16 15.5h9.8c4 0 6.7 2 6.7 5.2 0 1.9-.9 3.3-2.5 4.2 2.1.8 3.2 2.5 3.2 4.8 0 3.8-3 6.1-7.7 6.1H16zm8.8 8c1.8 0 2.8-.7 2.8-2.1s-1-2.1-2.8-2.1h-4v4.2zm.4 8.4c2 0 3.1-.8 3.1-2.4 0-1.5-1.1-2.3-3.1-2.3h-4.4v4.7z"
          fill="oklch(0.15 0.025 250)"
        />
        <path d="M34.5 11.5 38 13v6" fill="none" stroke="white" strokeLinecap="round" strokeOpacity=".65" />
      </svg>
      {!compact && (
        <span className="min-w-0">
          <span className={cn("block whitespace-nowrap font-bold tracking-[-0.035em] text-foreground", size === "lg" ? "text-xl" : "text-base")}>
            BID <span className="text-primary">SHIELD</span>
          </span>
          {subtitle && (
            <span className="mt-0.5 block truncate text-[10px] font-medium tracking-[0.04em] text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </div>
  );
});
