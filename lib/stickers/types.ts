import type { PriceBreakdown } from "@/lib/stickers/pricing";

// Re-export PriceBreakdown from pricing for convenience
export type { PriceBreakdown };

// Shared order types now live in lib/orders/types.ts (generalized for stickers +
// store orders). Re-exported here for back-compat — existing sticker code keeps
// importing OrderStatus/PaymentStatus/DeliveryInput/OrderView from this module.
export type {
  OrderKind,
  OrderStatus,
  PaymentStatus,
  DeliveryMethod,
  DeliveryInput,
  StoreLineItem,
  StickerOrderView,
  StoreOrderView,
  OrderView,
} from "@/lib/orders/types";

export type LocalStickerStatus = "ready" | "uploading" | "failed";

export type LocalSticker = {
  id: string;         // client-generated (crypto.randomUUID in the tool)
  name: string;       // original filename
  objectUrl: string;  // URL.createObjectURL(file) — owned/revoked by the parent tool
  bytes: number;
  status: LocalStickerStatus;
  progress?: number;  // 0..1 while uploading
  width?: number;     // natural image width in px (0 if unknown)
  height?: number;    // natural image height in px (0 if unknown)
  /** True when this sticker is already uploaded (loaded from a saved draft). */
  remote?: boolean;
  /** S3 key for a remote sticker (its DB id is `id`). */
  storageKey?: string;
};

/** Result of a successful sticker upload; `key` is the S3 object key. */
export type UploadedSticker = {
  stickerId: string;
  key: string;
  width: number;
  height: number;
  bytes: number;
};

/** Client → server file descriptor for draft creation. */
export type StickerMeta = {
  filename: string;
  bytes: number;
  contentType: string;
  width: number;
  height: number;
};
