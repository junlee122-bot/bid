import { forwardRef, type SVGAttributes } from "react";

import { cn } from "./cn";

export type IconName =
  | "activity"
  | "alertTriangle"
  | "arrowRight"
  | "arrowUpRight"
  | "bank"
  | "barChart"
  | "briefcase"
  | "building"
  | "check"
  | "checkCircle"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "clock"
  | "database"
  | "download"
  | "externalLink"
  | "fileText"
  | "info"
  | "lock"
  | "menu"
  | "minus"
  | "plus"
  | "refresh"
  | "scale"
  | "search"
  | "settings"
  | "shield"
  | "sparkles"
  | "target"
  | "trendingUp"
  | "users"
  | "wallet"
  | "x";

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  title?: string;
  strokeWidth?: number;
}

function IconPaths({ name }: { name: IconName }) {
  switch (name) {
    case "activity":
      return <><path d="M3 12h4l2.2-6 4.1 12 2.2-6H21" /></>;
    case "alertTriangle":
      return <><path d="m21 19-8.7-15a1.5 1.5 0 0 0-2.6 0L1 19a1.5 1.5 0 0 0 1.3 2h17.4A1.5 1.5 0 0 0 21 19Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>;
    case "arrowRight":
      return <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>;
    case "arrowUpRight":
      return <><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>;
    case "bank":
      return <><path d="m3 10 9-6 9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" /></>;
    case "barChart":
      return <><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7" /><path d="M2 20h20" /></>;
    case "briefcase":
      return <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>;
    case "building":
      return <><path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M17 9h2a2 2 0 0 1 2 2v10M2 21h20" /><path d="M8 7h2M13 7h.01M8 11h2M13 11h.01M8 15h2M13 15h.01M9 21v-3h3v3" /></>;
    case "check":
      return <path d="m5 12 4 4L19 6" />;
    case "checkCircle":
      return <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>;
    case "chevronDown":
      return <path d="m6 9 6 6 6-6" />;
    case "chevronLeft":
      return <path d="m15 18-6-6 6-6" />;
    case "chevronRight":
      return <path d="m9 18 6-6-6-6" />;
    case "clock":
      return <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>;
    case "database":
      return <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>;
    case "download":
      return <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>;
    case "externalLink":
      return <><path d="M14 5h5v5M19 5l-9 9" /><path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" /></>;
    case "fileText":
      return <><path d="M6 2h8l5 5v15H6z" /><path d="M14 2v6h5M9 13h6M9 17h6" /></>;
    case "info":
      return <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>;
    case "lock":
      return <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>;
    case "menu":
      return <><path d="M4 6h16M4 12h16M4 18h16" /></>;
    case "minus":
      return <path d="M5 12h14" />;
    case "plus":
      return <path d="M12 5v14M5 12h14" />;
    case "refresh":
      return <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.5-2.5L20 8M4 16l2.4 2.5A7 7 0 0 0 18 16" /></>;
    case "scale":
      return <><path d="M12 3v18M5 6h14M5 6l-3 7h6zM19 6l-3 7h6zM8 21h8" /></>;
    case "search":
      return <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>;
    case "settings":
      return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>;
    case "shield":
      return <><path d="M12 2 4.5 5v5.7c0 4.9 3 8.6 7.5 11.3 4.5-2.7 7.5-6.4 7.5-11.3V5z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>;
    case "sparkles":
      return <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8zM5 13l.8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8z" /></>;
    case "target":
      return <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>;
    case "trendingUp":
      return <><path d="m3 17 6-6 4 4 8-9" /><path d="M15 6h6v6" /></>;
    case "users":
      return <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>;
    case "wallet":
      return <><path d="M4 6h14a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12v3" /><path d="M20 11h-5a2 2 0 0 0 0 4h5" /></>;
    case "x":
      return <path d="M6 6l12 12M18 6 6 18" />;
  }
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, size = 20, title, className, strokeWidth = 1.8, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
      {...props}
    >
      {title && <title>{title}</title>}
      <IconPaths name={name} />
    </svg>
  );
});
