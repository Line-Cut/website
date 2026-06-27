import type { PriceBreakdown } from "@/lib/stickers/pricing";

// Re-export PriceBreakdown for convenience (used by the sticker order view).
export type { PriceBreakdown };

/** Which product line an order belongs to. */
export type OrderKind = "stickers" | "store";

export type OrderStatus =
  | "received"
  | "seen"
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
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
};

/** A single store line item in an order read-model (localized for display). */
export type StoreLineItem = {
  /** Source product id; absent if the product was later deleted. */
  productId?: string;
  title: string;
  imageUrl?: string;
  /** Selected options, already localized: e.g. { label: "Size", value: "A3" }. */
  options: { label: string; value: string }[];
  quantity: number;
  unitPrice: number; // agorot
  lineTotal: number; // agorot
};

type OrderViewBase = {
  orderId: string;
  guestToken?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAtISO: string;
  /** Grand total in minor units (agorot). */
  total: number;
  currency: string;
  delivery: DeliveryInput;
};

/** Read-model for a sticker order (sheet-based pricing). */
export type StickerOrderView = OrderViewBase & {
  kind: "stickers";
  copies: number;
  breakdown: PriceBreakdown;
};

/** Read-model for a store order (cart line items). */
export type StoreOrderView = OrderViewBase & {
  kind: "store";
  items: StoreLineItem[];
};

/**
 * Shared read-model used by receipt, order history, and tracking pages.
 * Discriminated on `kind` — branch before reading kind-specific fields.
 */
export type OrderView = StickerOrderView | StoreOrderView;
