export type StickerConfig = {
  readonly stickerSizeMm: number;
  readonly gutterMm: number;
  readonly sheet: {
    readonly widthMm: number;
    readonly heightMm: number;
    readonly marginMm: number;
  };
  /** Money in minor units (agorot). TODO(client): set real rate (agorot) */
  readonly perSheetRate: number;
  /** Money in minor units (agorot). TODO(client): set real rate (agorot) */
  readonly setupFee: number;
  readonly currency: string;
  readonly maxStickers: number;
  readonly maxFileBytes: number;
  readonly acceptedMime: string;
};

export const stickerConfig: StickerConfig = {
  stickerSizeMm: 50,
  gutterMm: 3,
  sheet: {
    widthMm: 210,
    heightMm: 297,
    marginMm: 8,
  },
  perSheetRate: 2500,
  setupFee: 1000,
  currency: "ILS",
  maxStickers: 200,
  maxFileBytes: 5 * 1024 * 1024,
  acceptedMime: "image/webp",
} as const;
