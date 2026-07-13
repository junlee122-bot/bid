import { forwardRef, type HTMLAttributes, type TableHTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react";

import { cn } from "./cn";

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  containerClassName?: string;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  { className, containerClassName, ...props },
  ref,
) {
  return (
    <div className={cn("w-full overflow-x-auto", containerClassName)}>
      <table ref={ref} className={cn("w-full min-w-[640px] caption-bottom text-sm", className)} {...props} />
    </div>
  );
});

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableHeader({ className, ...props }, ref) {
    return <thead ref={ref} className={cn("border-b border-border", className)} {...props} />;
  },
);

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableBody({ className, ...props }, ref) {
    return <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
  },
);

export const TableFooter = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableFooter({ className, ...props }, ref) {
    return (
      <tfoot
        ref={ref}
        className={cn("border-t border-border bg-muted/50 font-semibold", className)}
        {...props}
      />
    );
  },
);

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  function TableRow({ className, ...props }, ref) {
    return (
      <tr
        ref={ref}
        className={cn(
          "border-b border-border/70 transition-colors hover:bg-muted/35 data-[state=selected]:bg-primary/8",
          className,
        )}
        {...props}
      />
    );
  },
);

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  function TableHead({ className, ...props }, ref) {
    return (
      <th
        ref={ref}
        className={cn(
          "h-11 px-4 text-start align-middle text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  function TableCell({ className, ...props }, ref) {
    return <td ref={ref} className={cn("px-4 py-3 align-middle", className)} {...props} />;
  },
);

export const TableCaption = forwardRef<
  HTMLTableCaptionElement,
  HTMLAttributes<HTMLTableCaptionElement>
>(function TableCaption({ className, ...props }, ref) {
  return (
    <caption ref={ref} className={cn("mt-4 text-xs text-muted-foreground", className)} {...props} />
  );
});
