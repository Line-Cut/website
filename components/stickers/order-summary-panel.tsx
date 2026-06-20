"use client";

import type { Dictionary } from "@/lib/dictionary";
import { computePrice } from "@/lib/stickers/pricing";
import { PriceBreakdownView } from "@/components/stickers/price-breakdown";
import { CopiesStepper } from "@/components/stickers/copies-stepper";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  uniqueCount: number;
  copies: number;
  onCopiesChange: (n: number) => void;
  dict: Dictionary["stickers"];
  locale: "he" | "en";
  onContinue?: () => void;
  continueDisabled?: boolean;
};

export function OrderSummaryPanel({
  uniqueCount,
  copies,
  onCopiesChange,
  dict,
  locale,
  onContinue,
  continueDisabled,
}: Props) {
  const breakdown = computePrice(uniqueCount, copies);
  const isDisabled = continueDisabled ?? uniqueCount === 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-xl border border-line bg-paper p-6 shadow-sm",
      )}
    >
      {/* Heading */}
      <h2 className="font-display text-xl font-semibold text-ink">
        {dict.pricing.heading}
      </h2>

      {/* Copies stepper */}
      <CopiesStepper
        value={copies}
        onChange={onCopiesChange}
        dict={dict.pricing}
      />

      {/* Live price breakdown — aria-live so screen readers announce updates */}
      <div aria-live="polite" aria-atomic="true">
        <PriceBreakdownView
          breakdown={breakdown}
          dict={dict.pricing}
          locale={locale}
        />
      </div>

      {/* Primary CTA */}
      <Button
        variant="primary"
        onClick={onContinue}
        disabled={isDisabled}
        className="w-full"
      >
        {dict.pricing.continue}
      </Button>
    </div>
  );
}
