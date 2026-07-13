"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";
import { Icon } from "./icons";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  closeLabel?: string;
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  closeLabel = "닫기",
}: ModalProps) {
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
        "fixed inset-x-4 top-1/2 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-slate-950/75 backdrop:backdrop-blur-sm",
        sizes[size],
        className,
      )}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" aria-label={closeLabel} onClick={() => onOpenChange(false)} className="-me-2 -mt-2 size-9">
            <Icon name="x" size={18} />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-border p-4 sm:px-6">{footer}</footer>}
      </div>
    </dialog>
  );
}
