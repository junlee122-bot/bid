"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "./cn";

interface TabsContextValue {
  baseId: string;
  value: string;
  setValue: (value: string) => void;
  orientation: "horizontal" | "vertical";
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error(`${component} must be used inside <Tabs>.`);
  return context;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
}

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  {
    value,
    defaultValue = "",
    onValueChange,
    orientation = "horizontal",
    className,
    children,
    ...props
  },
  ref,
) {
  const baseId = useId().replace(/:/g, "");
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = value ?? internalValue;

  function setValue(nextValue: string): void {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  return (
    <TabsContext.Provider value={{ baseId, value: selected, setValue, orientation }}>
      <div ref={ref} className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
});

export const TabsList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function TabsList({ className, onKeyDown, ...props }, ref) {
    const { orientation } = useTabsContext("TabsList");

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      const validKeys =
        orientation === "horizontal"
          ? ["ArrowLeft", "ArrowRight", "Home", "End"]
          : ["ArrowUp", "ArrowDown", "Home", "End"];
      if (!validKeys.includes(event.key)) return;

      const tabs = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
      );
      const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
      if (currentIndex < 0) return;

      event.preventDefault();
      const previousKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
      let nextIndex = currentIndex;
      if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else if (event.key === previousKey) nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      else nextIndex = (currentIndex + 1) % tabs.length;
      tabs[nextIndex]?.focus();
      tabs[nextIndex]?.click();
    }

    return (
      <div
        ref={ref}
        role="tablist"
        aria-orientation={orientation}
        onKeyDown={handleKeyDown}
        className={cn(
          "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted/55 p-1",
          orientation === "vertical" && "flex-col items-stretch",
          className,
        )}
        {...props}
      />
    );
  },
);

export interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  { value, className, children, onClick, ...props },
  ref,
) {
  const { baseId, value: selectedValue, setValue } = useTabsContext("TabsTrigger");
  const selected = selectedValue === value;

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      data-state={selected ? "active" : "inactive"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setValue(value);
      }}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold text-muted-foreground outline-none transition-[color,background-color,box-shadow] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 data-[state=active]:bg-card-elevated data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  forceMount?: boolean;
}

export const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(function TabsContent(
  { value, forceMount = false, className, ...props },
  ref,
) {
  const { baseId, value: selectedValue } = useTabsContext("TabsContent");
  const selected = selectedValue === value;
  if (!selected && !forceMount) return null;

  return (
    <div
      ref={ref}
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      hidden={!selected}
      className={cn("mt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      {...props}
    />
  );
});
