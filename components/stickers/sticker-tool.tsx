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
import { createOrderDraft, updateOrderDraft } from "@/app/actions/stickers";
import { uploadFiles } from "@/lib/stickers/upload-client";
import { StepIndicator } from "@/components/stickers/step-indicator";

// ---------------------------------------------------------------------------
// Server error code → dict key mapping
// ---------------------------------------------------------------------------

const SERVER_ERROR_KEY: Record<string, "serverError" | "notFound" | "uploadsIncomplete" | "paymentFailed" | "noStickers"> = {
  db_error: "serverError",
  not_found: "notFound",
  uploads_incomplete: "uploadsIncomplete",
  payment_failed: "paymentFailed",
  no_stickers: "noStickers",
  server_misconfigured: "serverError",
};

// ---------------------------------------------------------------------------
// StickerTool — main orchestrator
// ---------------------------------------------------------------------------

type Props = {
  dict: Dictionary["stickers"];
  lang: "he" | "en";
  isSignedIn: boolean;
  initialDraft?: import("@/lib/orders/draft-view").DraftEditData | null;
};

export function StickerTool({ dict, lang, isSignedIn, initialDraft = null }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<LocalSticker[]>(() =>
    (initialDraft?.stickers ?? []).map((s) => ({
      id: s.id,
      name: s.filename,
      objectUrl: s.url,
      bytes: s.bytes,
      status: "ready" as const,
      width: s.width ?? 0,
      height: s.height ?? 0,
      remote: true,
      storageKey: s.storageKey,
    })),
  );
  const [copies, setCopies] = useState(initialDraft?.copies ?? 1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Track the draft id (set from initialDraft, or assigned after first create).
  const draftIdRef = useRef<string | null>(initialDraft?.orderId ?? null);

  // Keep a ref that always has the latest items for cleanup on unmount.
  const itemsRef = useRef<LocalSticker[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  // Map from sticker id → File (kept out of LocalSticker to avoid complicating state).
  const filesRef = useRef<Map<string, File>>(new Map());

  // Revoke object URLs for LOCAL stickers only on unmount (remote ones are presigned URLs).
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        if (!item.remote) URL.revokeObjectURL(item.objectUrl);
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
      if (item && !item.remote) {
        URL.revokeObjectURL(item.objectUrl);
        filesRef.current.delete(id);
      }
      return prev.filter((s) => s.id !== id);
    });
  }

  // Returns { orderId, guestToken } on success, or null on failure (sets submitError).
  async function persistDraft(): Promise<{ orderId: string; guestToken: string } | null> {
    const newLocal = items.filter((i) => !i.remote);
    const addStickers: StickerMeta[] = newLocal.map((item) => ({
      filename: item.name,
      bytes: item.bytes,
      contentType: "image/webp",
      width: item.width ?? 0,
      height: item.height ?? 0,
    }));

    setItems((prev) => prev.map((i) => (i.remote ? i : { ...i, status: "uploading" as const, progress: 0 })));

    let uploads: { stickerId: string; key: string; url: string }[];
    let handle: { orderId: string; guestToken: string };

    if (draftIdRef.current) {
      const res = await updateOrderDraft({
        orderId: draftIdRef.current,
        keepStickerIds: items.filter((i) => i.remote).map((i) => i.id),
        addStickers,
        copies,
      });
      if (!res.ok) {
        setSubmitError(dict.errors[SERVER_ERROR_KEY[res.message ?? ""] ?? "serverError"]);
        return null;
      }
      uploads = res.uploads;
      handle = { orderId: res.orderId, guestToken: res.guestToken };
    } else {
      const res = await createOrderDraft({ stickers: addStickers, copies });
      if (!res.ok) {
        setSubmitError(dict.errors[SERVER_ERROR_KEY[res.message ?? ""] ?? "serverError"]);
        return null;
      }
      uploads = res.uploads;
      handle = { orderId: res.orderId, guestToken: res.guestToken };
      draftIdRef.current = res.orderId;
    }

    // Upload only the NEW local files, pairing by stickerId order == newLocal order.
    const pairs = uploads.map((u, i) => ({
      url: u.url,
      file: filesRef.current.get(newLocal[i].id) ?? new File([], newLocal[i].name),
    }));
    const results = await uploadFiles(pairs, { onEach: () => {} });
    if (results.some((r) => !r.ok)) {
      setSubmitError(dict.errors.uploadFailed);
      return null;
    }

    // Reconcile each just-saved local sticker to its SERVER row (id + key) and
    // mark it remote, so a subsequent save sends real DB ids as keepStickerIds
    // (never the client UUID). uploads[i] aligns 1:1 with newLocal[i].
    const serverByLocalId = new Map(
      newLocal.map((s, i) => [
        s.id,
        { id: uploads[i].stickerId, key: uploads[i].key },
      ]),
    );
    for (const s of newLocal) filesRef.current.delete(s.id); // file no longer needed
    setItems((prev) =>
      prev.map((i) => {
        if (i.remote) return i;
        const server = serverByLocalId.get(i.id);
        return server
          ? { ...i, status: "ready" as const, remote: true, id: server.id, storageKey: server.key }
          : { ...i, status: "ready" as const, remote: true };
      }),
    );
    return handle;
  }

  async function handleContinue() {
    if (items.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const handle = await persistDraft();
    if (!handle) { setSubmitting(false); return; }
    sessionStorage.setItem("linecut_order", JSON.stringify({ orderId: handle.orderId, guestToken: handle.guestToken }));
    router.push(`/${lang}/stickers/checkout`);
    // Note: don't clear submitting here — navigation is in progress
  }

  async function handleSaveDraft() {
    if (items.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const handle = await persistDraft();
    if (handle) {
      // Keep `submitting` set through navigation so a double-click can't fire a
      // second save (which would re-key the just-saved stickers).
      router.push(`/${lang}/account/orders`);
    } else {
      setSubmitting(false);
    }
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
            {submitting ? dict.pricing.uploading : dict.pricing.continue}
          </Button>
        </div>
      )}

      {/* Save draft button (signed-in users only) */}
      {isSignedIn && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={submitting || !hasItems}
            onClick={handleSaveDraft}
            className="min-h-[44px]"
          >
            {dict.builder.saveDraft}
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
