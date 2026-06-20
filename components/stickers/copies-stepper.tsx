"use client";

import { useId } from "react";
import type { Dictionary } from "@/lib/dictionary";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (n: number) => void;
  dict: Dictionary["stickers"]["pricing"];
  min?: number;
};

function clamp(raw: string, min: number): number {
  const parsed = parseFloat(raw);
  if (isNaN(parsed)) return min;
  return Math.max(min, Math.floor(parsed));
}

export function CopiesStepper({ value, onChange, dict, min = 1 }: Props) {
  const inputId = `copies-stepper-${useId()}`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {dict.copies}
      </label>
      <div className="flex items-center gap-2">
        {/* Decrease button */}
        <button
          type="button"
          aria-label={dict.decrease}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-md border border-line",
            "text-lg font-semibold text-ink transition-colors",
            "hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
          )}
        >
          −
        </button>

        {/* Numeric input */}
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={min}
          value={value}
          onChange={(e) => {
            onChange(clamp(e.target.value, min));
          }}
          onBlur={(e) => {
            onChange(clamp(e.target.value, min));
          }}
          className={cn(
            "h-11 w-16 rounded-md border border-line bg-paper text-center text-sm tabular-nums text-ink",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
          )}
        />

        {/* Increase button */}
        <button
          type="button"
          aria-label={dict.increase}
          onClick={() => onChange(value + 1)}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-md border border-line",
            "text-lg font-semibold text-ink transition-colors",
            "hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
          )}
        >
          +
        </button>
      </div>
    </div>
  );
}
