"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/lib/dictionary";
import type { LocalSticker } from "@/lib/stickers/types";
import { stickerConfig } from "@/lib/stickers/sticker-config";
import { StickerUploader } from "@/components/stickers/sticker-uploader";
import { UploadedGrid } from "@/components/stickers/uploaded-grid";
import { A4Preview } from "@/components/stickers/a4-preview";
import { OrderSummaryPanel } from "@/components/stickers/order-summary-panel";

// ---------------------------------------------------------------------------
// StepIndicator — small inline component; accessible number+label+state
// ---------------------------------------------------------------------------

type StepIndicatorProps = {
  steps: { key: string; label: string }[];
  current: number; // 0-based index of the active step
};

function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-center gap-0">
        {steps.map((step, i) => {
          const isActive = i === current;
          const isDone = i < current;

          return (
            <li
              key={step.key}
              className="flex flex-1 flex-col items-center gap-1"
              aria-current={isActive ? "step" : undefined}
            >
              {/* Connector line before (not for first item) */}
              <div className="flex w-full items-center">
                {/* Left line */}
                <div
                  className={[
                    "h-px flex-1",
                    i === 0 ? "invisible" : isDone || isActive ? "bg-accent" : "bg-line",
                  ].join(" ")}
                  aria-hidden="true"
                />
                {/* Circle */}
                <span
                  className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
                    isActive
                      ? "border-accent bg-accent text-paper"
                      : isDone
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line bg-paper text-muted",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                {/* Right line */}
                <div
                  className={[
                    "h-px flex-1",
                    i === steps.length - 1 ? "invisible" : isDone ? "bg-accent" : "bg-line",
                  ].join(" ")}
                  aria-hidden="true"
                />
              </div>

              {/* Label */}
              <span
                className={[
                  "text-xs font-medium",
                  isActive ? "text-accent" : isDone ? "text-accent/80" : "text-muted",
                ].join(" ")}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// StickerTool — main orchestrator
// ---------------------------------------------------------------------------

type Props = {
  dict: Dictionary["stickers"];
  lang: "he" | "en";
};

export function StickerTool({ dict, lang }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<LocalSticker[]>([]);
  const [copies, setCopies] = useState(1);

  // Keep a ref that always has the latest items for cleanup on unmount.
  const itemsRef = useRef<LocalSticker[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  // Revoke ALL remaining object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.objectUrl);
      }
    };
  }, []);

  function handleAdd(files: File[]) {
    const newItems: LocalSticker[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      objectUrl: URL.createObjectURL(file),
      bytes: file.size,
      status: "ready" as const,
    }));
    setItems((prev) => [...prev, ...newItems]);
  }

  function handleRemove(id: string) {
    setItems((prev) => {
      const item = prev.find((s) => s.id === id);
      if (item) URL.revokeObjectURL(item.objectUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  function handleContinue() {
    router.push(`/${lang}/stickers/checkout`);
  }

  const steps = [
    { key: "build", label: dict.steps.build },
    { key: "details", label: dict.steps.details },
    { key: "confirm", label: dict.steps.confirm },
  ];

  const hasItems = items.length > 0;

  return (
    <div className="flex flex-col gap-8 py-10">
      {/* Step indicator */}
      <StepIndicator steps={steps} current={0} />

      {/* Intro heading */}
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">
          {dict.intro.heading}
        </h1>
        <p className="mt-2 text-base text-muted">{dict.intro.lead}</p>
      </div>

      {/* Mobile: sticky bottom price+CTA bar when there are items */}
      {hasItems && (
        <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
          <span className="text-sm text-muted">
            {items.length}{" "}
            {dict.upload.countLabel
              .replace("{count}", String(items.length))
              .replace("{max}", String(stickerConfig.maxStickers))}
          </span>
          <button
            type="button"
            onClick={handleContinue}
            disabled={items.length === 0}
            className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-paper hover:bg-[color:var(--color-accent-600)] disabled:pointer-events-none disabled:opacity-50"
          >
            {dict.pricing.continue}
          </button>
        </div>
      )}

      {/* Main layout: single column on mobile, two columns on desktop */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-10">
        {/* Left column: uploader + grid + preview */}
        <div className="flex flex-col gap-8">
          <StickerUploader
            existingCount={items.length}
            dict={dict}
            onAdd={handleAdd}
            disabled={items.length >= stickerConfig.maxStickers}
          />

          {hasItems && (
            <>
              {/* Add bottom padding on mobile so the sticky bar doesn't obscure content */}
              <div className="pb-20 lg:pb-0">
                <UploadedGrid items={items} dict={dict} onRemove={handleRemove} />
              </div>
              <A4Preview
                srcs={items.map((i) => i.objectUrl)}
                dict={dict.preview}
                locale={lang}
              />
            </>
          )}
        </div>

        {/* Right column (desktop): sticky summary rail */}
        <aside className="hidden lg:block lg:sticky lg:top-20">
          <OrderSummaryPanel
            uniqueCount={items.length}
            copies={copies}
            onCopiesChange={setCopies}
            dict={dict}
            locale={lang}
            onContinue={handleContinue}
          />
        </aside>
      </div>

      {/* Mobile: full OrderSummaryPanel below the editor (hidden on desktop) */}
      {hasItems && (
        <div className="lg:hidden">
          <OrderSummaryPanel
            uniqueCount={items.length}
            copies={copies}
            onCopiesChange={setCopies}
            dict={dict}
            locale={lang}
            onContinue={handleContinue}
          />
        </div>
      )}
    </div>
  );
}
