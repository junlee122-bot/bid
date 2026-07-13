"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "./cn";

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
  valueLabel?: string;
  unit?: string;
  onValueChange?: (value: number) => void;
  containerClassName?: string;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    className,
    containerClassName,
    label,
    valueLabel,
    unit = "",
    value,
    defaultValue,
    min = 0,
    max = 100,
    onChange,
    onValueChange,
    id,
    ...props
  },
  ref,
) {
  const displayValue = valueLabel ?? `${value ?? defaultValue ?? min}${unit}`;

  return (
    <label htmlFor={id} className={cn("block w-full", containerClassName)}>
      {(label || valueLabel) && (
        <span className="mb-2 flex items-center justify-between gap-4 text-xs">
          <span className="font-medium text-muted-foreground">{label}</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">{displayValue}</span>
        </span>
      )}
      <input
        ref={ref}
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        defaultValue={defaultValue}
        onChange={(event) => {
          onChange?.(event);
          onValueChange?.(event.currentTarget.valueAsNumber);
        }}
        className={cn(
          "h-5 w-full cursor-pointer appearance-none bg-transparent accent-primary outline-none disabled:cursor-not-allowed disabled:opacity-45 [&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-primary [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-muted [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_var(--card)]",
          className,
        )}
        {...props}
      />
    </label>
  );
});
