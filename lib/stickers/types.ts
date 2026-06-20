// Re-export PriceBreakdown from pricing for convenience
export type { PriceBreakdown } from "@/lib/stickers/pricing";

export type LocalStickerStatus = "ready" | "uploading" | "failed";

export type LocalSticker = {
  id: string;         // client-generated (crypto.randomUUID in the tool)
  name: string;       // original filename
  objectUrl: string;  // URL.createObjectURL(file) — owned/revoked by the parent tool
  bytes: number;
  status: LocalStickerStatus;
  progress?: number;  // 0..1 while uploading
};

import type { PriceBreakdown } from "@/lib/stickers/pricing";

/** Result of a successful sticker upload; `key` is the S3 object key. */
export type UploadedSticker = {
  stickerId: string;
  key: string;
  width: number;
  height: number;
  bytes: number;
};

export type OrderStatus =
  | "received"
  | "in_production"
  | "ready"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentStatus =
  | "awaiting_payment"
  | "paid"
  | "refunded"
  | "waived";

export type DeliveryMethod = "pickup" | "shipping";

export type DeliveryInput = {
  method: DeliveryMethod;
  fullName: string;
  phone: string;
  email: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
};

/** Client → server file descriptor for draft creation. */
export type StickerMeta = {
  filename: string;
  bytes: number;
  contentType: string;
  width: number;
  height: number;
};

/** Shared read-model used by receipt, order history, and tracking pages. */
export type OrderView = {
  orderId: string;
  guestToken?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAtISO: string;
  copies: number;
  breakdown: PriceBreakdown;
  delivery: DeliveryInput;
};
