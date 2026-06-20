"use client";

import { useState, useEffect } from "react";
import { A4Page } from "@/components/stickers/a4-page";
import { computePacking } from "@/lib/stickers/packing";
import { stickerConfig } from "@/lib/stickers/sticker-config";
import { interpolate } from "@/lib/stickers/format";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/dictionary";

type Props = {
  srcs: string[];
  dict: Dictionary["stickers"]["preview"];
  locale: "he" | "en";
};

const { columns, perSheet } = computePacking(stickerConfig);
const marginPct = (stickerConfig.sheet.marginMm / stickerConfig.sheet.widthMm) * 100;
const usableWidthMm = stickerConfig.sheet.widthMm - 2 * stickerConfig.sheet.marginMm;
const gutterPct = (stickerConfig.gutterMm / usableWidthMm) * 100;

export function A4Preview({ srcs, dict, locale: _locale }: Props) {
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(srcs.length / perSheet));

  // Clamp currentPage if srcs shrinks
  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [currentPage, totalPages]);

  if (srcs.length === 0) return null;

  const safePage = Math.min(currentPage, totalPages - 1);
  const pageSrcs = srcs.slice(safePage * perSheet, (safePage + 1) * perSheet);

  return (
    <div className="flex flex-col gap-4">
      {/* Disclaimer banner */}
      <div
        role="note"
        className="bg-accent/10 text-accent border border-accent/20 rounded-md p-3 text-sm"
      >
        {dict.disclaimer}
      </div>

      {/* A4 sheet */}
      <A4Page
        srcs={pageSrcs}
        columns={columns}
        gutterPct={gutterPct}
        marginPct={marginPct}
      />

      {/* Per-sheet hint */}
      <p className="text-sm text-muted text-center">
        {interpolate(dict.perSheet, { n: perSheet })}
      </p>

      {/* Page navigation — only when there are multiple pages */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            aria-label={dict.prev}
            disabled={safePage === 0}
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
          >
            {dict.prev}
          </Button>

          <span aria-live="polite" className="text-sm text-muted">
            {interpolate(dict.page, { current: safePage + 1, total: totalPages })}
          </span>

          <Button
            variant="outline"
            size="sm"
            aria-label={dict.next}
            disabled={safePage === totalPages - 1}
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            {dict.next}
          </Button>
        </div>
      )}
    </div>
  );
}
