"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/lib/dictionary";
import type { LocalSticker, StickerMeta } from "@/lib/stickers/types";
import { stickerConfig } from "@/lib/stickers/sticker-config";
import { interpolate } from "@/lib/stickers/format";
import { Button } from "@/components/ui/button";
import { StickerUploader } from "@/components/stickers/sticker-uploader";
import { UploadedGrid } from "@/components/stickers/uploaded-grid";
import { A4Preview } from "@/components/stickers/a4-preview";
import { OrderSummaryPanel } from "@/components/stickers/order-summary-panel";
import { createOrderDraft } from "@/app/actions/stickers";
import { uploadFiles } from "@/lib/stickers/upload-client";

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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Keep a ref that always has the latest items for cleanup on unmount.
  const itemsRef = useRef<LocalSticker[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  // Map from sticker id → File (kept out of LocalSticker to avoid complicating state).
  const filesRef = useRef<Map<string, File>>(new Map());

  // Revoke ALL remaining object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.objectUrl);
      }
    };
  }, []);

  function handleAdd(files: File[]) {
    const newItems: LocalSticker[] = files.map((file) => {
      const id = crypto.randomUUID();
      const objectUrl = URL.createObjectURL(file);

      // Store the File for later upload
      filesRef.current.set(id, file);

      // Best-effort dimension capture (informational; use 0 on failure)
      const img = new Image();
      img.onload = () => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, width: img.naturalWidth, height: img.naturalHeight }
              : item,
          ),
        );
      };
      img.src = objectUrl;

      return {
        id,
        name: file.name,
        objectUrl,
        bytes: file.size,
        status: "ready" as const,
        width: 0,
        height: 0,
      };
    });
    setItems((prev) => [...prev, ...newItems]);
  }

  function handleRemove(id: string) {
    setItems((prev) => {
      const item = prev.find((s) => s.id === id);
      if (item) URL.revokeObjectURL(item.objectUrl);
      filesRef.current.delete(id);
      return prev.filter((s) => s.id !== id);
    });
  }

  async function handleContinue() {
    if (items.length === 0 || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    // 1. Mark all items uploading
    setItems((prev) =>
      prev.map((item) => ({ ...item, status: "uploading" as const, progress: 0 })),
    );

    // 2. Build sticker metadata
    const stickers: StickerMeta[] = items.map((item) => ({
      filename: item.name,
      bytes: item.bytes,
      contentType: "image/webp",
      width: item.width ?? 0,
      height: item.height ?? 0,
    }));

    // 3. Create the order draft on the server
    let res: Awaited<ReturnType<typeof createOrderDraft>>;
    try {
      res = await createOrderDraft({ stickers, copies });
    } catch {
      setItems((prev) => prev.map((item) => ({ ...item, status: "ready" as const })));
      setSubmitError(dict.errors.uploadFailed || "Upload failed. Please try again.");
      setSubmitting(false);
      return;
    }

    if (!res.ok) {
      setItems((prev) => prev.map((item) => ({ ...item, status: "ready" as const })));
      setSubmitError(res.message ?? dict.errors.uploadFailed ?? "An error occurred. Please try again.");
      setSubmitting(false);
      return;
    }

    // 4. Pair presigned URLs with files and upload
    const pairs = res.uploads.map((upload, i) => ({
      url: upload.url,
      file: filesRef.current.get(items[i].id) ?? new File([], items[i].name),
    }));

    const uploadResults = await uploadFiles(pairs, {
      onEach: (i, status) => {
        setItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? { ...item, status: status === "done" ? ("ready" as const) : ("failed" as const) }
              : item,
          ),
        );
      },
    });

    const anyFailed = uploadResults.some((r) => !r.ok);

    if (anyFailed) {
      setSubmitError(dict.errors.uploadFailed || "Some files failed to upload. Please retry.");
      setSubmitting(false);
      return;
    }

    // 5. All uploads succeeded — persist order handle and navigate
    sessionStorage.setItem(
      "linecut_order",
      JSON.stringify({ orderId: res.orderId, guestToken: res.guestToken }),
    );
    router.push(`/${lang}/stickers/checkout`);
    // Note: don't clear submitting here — navigation is in progress
  }

  const steps = [
    { key: "build", label: dict.steps.build },
    { key: "details", label: dict.steps.details },
    { key: "confirm", label: dict.steps.confirm },
  ];

  const hasItems = items.length > 0;

  return (
    <div className="flex flex-col gap-8 py-10 pb-20 lg:pb-10">
      {/* Step indicator */}
      <StepIndicator steps={steps} current={0} />

      {/* Intro heading */}
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">
          {dict.intro.heading}
        </h1>
        <p className="mt-2 text-base text-muted">{dict.intro.lead}</p>
      </div>

      {/* Submission error (aria-live for screen readers) */}
      {submitError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent"
        >
          {submitError}
        </div>
      )}

      {/* Mobile: sticky bottom price+CTA bar when there are items */}
      {hasItems && (
        <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
          <span className="text-sm text-muted">
            {interpolate(dict.upload.countLabel, { count: items.length, max: stickerConfig.maxStickers })}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={handleContinue}
            disabled={items.length === 0 || submitting}
          >
            {submitting ? "…" : dict.pricing.continue}
          </Button>
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
              <UploadedGrid items={items} dict={dict} onRemove={handleRemove} />
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
            continueDisabled={items.length === 0 || submitting}
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
            continueDisabled={items.length === 0 || submitting}
          />
        </div>
      )}
    </div>
  );
}
