import { stickerConfig } from "@/lib/stickers/sticker-config";
import type { StickerConfig } from "@/lib/stickers/sticker-config";

export type PackingResult = {
  columns: number;
  rows: number;
  perSheet: number;
  cellMm: number;
  usableMm: { width: number; height: number };
};

/**
 * Compute how many stickers fit on a single A4 sheet with the given config.
 *
 * fit(avail) = floor((avail + gutter) / (size + gutter))
 * This correctly accounts for the fact that the trailing gutter after the last
 * sticker is not needed.
 */
export function computePacking(cfg: StickerConfig = stickerConfig): PackingResult {
  const { stickerSizeMm, gutterMm, sheet } = cfg;

  const usableWidth = sheet.widthMm - 2 * sheet.marginMm;
  const usableHeight = sheet.heightMm - 2 * sheet.marginMm;

  function fit(avail: number): number {
    const cell = stickerSizeMm + gutterMm;
    if (cell <= 0) return 0;
    return Math.max(0, Math.floor((avail + gutterMm) / cell));
  }

  const columns = fit(usableWidth);
  const rows = fit(usableHeight);
  const perSheet = columns * rows;
  const cellMm = stickerSizeMm + gutterMm;

  return {
    columns,
    rows,
    perSheet,
    cellMm,
    usableMm: { width: usableWidth, height: usableHeight },
  };
}
