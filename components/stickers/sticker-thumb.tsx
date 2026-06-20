"use client";

import React from "react";
import Image from "next/image";
import type { LocalSticker } from "@/lib/stickers/types";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/stickers/format";
import { cn } from "@/lib/utils";

type Props = {
  item: LocalSticker;
  dict: Dictionary["stickers"]["thumb"];
  onRemove: (id: string) => void;
};

export const StickerThumb = React.memo(function StickerThumb({
  item,
  dict,
  onRemove,
}: Props) {
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-lg border border-line bg-paper-2",
      )}
    >
      {/* Sticker image */}
      <Image
        src={item.objectUrl}
        alt={item.name}
        fill
        unoptimized
        loading="lazy"
        className="object-contain"
      />

      {/* Remove button — ≥44×44px touch target, logical position end-1 top-1 */}
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={interpolate(dict.removeLabel, { name: item.name })}
        className={cn(
          "absolute end-1 top-1 flex h-11 w-11 items-center justify-center",
          "rounded-full bg-ink/60 text-paper backdrop-blur-sm transition-colors",
          "hover:bg-ink/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        )}
      >
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="2" y1="2" x2="12" y2="12" />
          <line x1="12" y1="2" x2="2" y2="12" />
        </svg>
      </button>

      {/* Status overlay */}
      {item.status === "uploading" && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex flex-col items-center justify-end bg-ink/30 p-2"
        >
          {/* Determinate progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper/40">
            <div
              className="h-full rounded-full bg-paper transition-[width]"
              style={{ width: `${Math.round((item.progress ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {item.status === "failed" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-ink/60 p-2 text-center">
          <span className="text-xs font-semibold text-paper">{dict.failed}</span>
          {/* Retry affordance — wired by parent in a later task */}
          <button
            type="button"
            className={cn(
              "mt-1 rounded px-2 py-1 text-xs font-medium text-paper underline",
              "hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            )}
            aria-label={`${dict.failed} — ${item.name}`}
          >
            {/* dict.retry lives under dict.errors, not dict.thumb — keep label generic */}
            ↩
          </button>
        </div>
      )}
    </div>
  );
});
