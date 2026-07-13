import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "./cn";
import { Icon, type IconName } from "./icons";

export type AlertVariant = "info" | "success" | "warning" | "destructive";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  icon?: ReactNode;
}

const variants: Record<AlertVariant, { styles: string; icon: IconName }> = {
  info: { styles: "border-primary/20 bg-primary/7 text-accent-foreground", icon: "info" },
  success: { styles: "border-success/20 bg-success/8 text-emerald-100", icon: "checkCircle" },
  warning: { styles: "border-warning/20 bg-warning/8 text-amber-100", icon: "alertTriangle" },
  destructive: { styles: "border-destructive/25 bg-destructive/9 text-red-100", icon: "alertTriangle" },
};

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { variant = "info", title, icon, children, className, ...props },
  ref,
) {
  const config = variants[variant];
  return (
    <div
      ref={ref}
      role={variant === "destructive" ? "alert" : "status"}
      className={cn("grid grid-cols-[auto_1fr] gap-3 rounded-lg border p-4 text-sm", config.styles, className)}
      {...props}
    >
      <span className="mt-0.5 text-current">{icon ?? <Icon name={config.icon} size={18} />}</span>
      <div className="min-w-0">
        {title && <p className="mb-1 font-semibold text-foreground">{title}</p>}
        <div className="leading-6 opacity-85">{children}</div>
      </div>
    </div>
  );
});
