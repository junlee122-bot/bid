import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "./cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "border border-primary/20 bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_var(--primary)] hover:bg-primary/90 active:bg-primary/80",
  secondary:
    "border border-border bg-secondary text-secondary-foreground hover:border-primary/25 hover:bg-secondary/80",
  outline:
    "border border-border bg-transparent text-foreground hover:border-primary/40 hover:bg-primary/8",
  ghost: "border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  destructive:
    "border border-destructive/20 bg-destructive text-white hover:bg-destructive/90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 rounded-md px-3 text-xs",
  md: "h-10 rounded-lg px-4 text-sm",
  lg: "h-12 rounded-xl px-5 text-sm",
  icon: "size-10 rounded-lg p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading = false,
    leadingIcon,
    trailingIcon,
    disabled,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-e-transparent"
        />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});
