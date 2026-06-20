"use client";

import React from "react";
import type { LocalSticker } from "@/lib/stickers/types";
import type { Dictionary } from "@/lib/dictionary";
import { StickerThumb } from "@/components/stickers/sticker-thumb";
import { stickerConfig } from "@/lib/stickers/sticker-config";
import { interpolate } from "@/lib/stickers/format";

type Props = {
  items: LocalSticker[];
  dict: Dictionary["stickers"];
  onRemove: (id: string) => void;
};

export function UploadedGrid({ items, dict, onRemove }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Count indicator — polite so SR announces after user finishes interacting */}
      <p aria-live="polite" aria-atomic="true" className="text-sm text-muted">
        {interpolate(dict.upload.countLabel, {
          count: items.length,
          max: stickerConfig.maxStickers,
        })}
      </p>

      {/* Responsive grid */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {items.map((item) => (
          <StickerThumb
            key={item.id}
            item={item}
            dict={dict.thumb}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
