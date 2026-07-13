"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";
import { Icon } from "./icons";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  side?: "left" | "right";
  className?: string;
  footer?: ReactNode;
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = "right",
  className,
  footer,
}: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      className={cn(
        "fixed inset-y-0 m-0 h-dvh max-h-none w-[min(92vw,28rem)] max-w-none overflow-hidden border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-slate-950/75 backdrop:backdrop-blur-sm",
        side === "right" ? "ms-auto border-s" : "me-auto border-e",
        className,
      )}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" aria-label="패널 닫기" onClick={() => onOpenChange(false)} className="-me-2 -mt-2 size-9">
            <Icon name="x" size={18} />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-border p-4">{footer}</footer>}
      </div>
    </dialog>
  );
}
