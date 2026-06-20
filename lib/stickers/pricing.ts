import { stickerConfig } from "@/lib/stickers/sticker-config";
import type { StickerConfig } from "@/lib/stickers/sticker-config";
import { computePacking } from "@/lib/stickers/packing";

export type PriceBreakdown = {
  uniqueCount: number;
  copies: number;
  perSheet: number;
  sheetsPerSet: number;
  totalSheets: number;
  sheetsSubtotal: number;
  setupFee: number;
  total: number;
  currency: string;
};

/**
 * Compute a price breakdown (all monetary values in minor units / agorot).
 *
 * Pure and deterministic — the server recomputes with the same function to
 * prevent client-side price tampering.
 *
 * @param uniqueCount - number of distinct sticker designs
 * @param copies      - number of full sets to produce
 * @param cfg         - sticker config (defaults to stickerConfig)
 */
export function computePrice(
  uniqueCount: number,
  copies: number,
  cfg: StickerConfig = stickerConfig,
): PriceBreakdown {
  const safeCopies = Math.max(1, Math.floor(copies));

  const { perSheet } = computePacking(cfg);

  const sheetsPerSet =
    uniqueCount <= 0 || perSheet <= 0
      ? 0
      : Math.ceil(uniqueCount / perSheet);

  const totalSheets = sheetsPerSet * safeCopies;
  const sheetsSubtotal = totalSheets * cfg.perSheetRate;
  const setupFee = uniqueCount > 0 ? cfg.setupFee : 0;
  const total = sheetsSubtotal + setupFee;

  return {
    uniqueCount,
    copies: safeCopies,
    perSheet,
    sheetsPerSet,
    totalSheets,
    sheetsSubtotal,
    setupFee,
    total,
    currency: cfg.currency,
  };
}
