import type {
  OrderKind,
  OrderStatus,
  PaymentStatus,
  DeliveryInput,
  StoreLineItem,
} from "@/lib/orders/types";

/** Order statuses + payment statuses, for validation + admin controls. */
export const ORDER_STATUSES: readonly OrderStatus[] = [
  "received",
  "seen",
  "in_production",
  "ready",
  "shipped",
  "delivered",
  "cancelled",
];

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "awaiting_payment",
  "paid",
  "refunded",
  "waived",
];

/** Compact row for the admin orders list. */
export type AdminOrderSummary = {
  orderId: string;
  guestToken: string;
  kind: OrderKind;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAtISO: string;
  contactName: string;
  contactEmail: string;
  total: number;
  currency: string;
  /** sticker designs or store line items, depending on kind. */
  itemCount: number;
};

/** Full order for the admin detail page. */
export type AdminOrderDetail = {
  orderId: string;
  guestToken: string;
  kind: OrderKind;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAtISO: string;
  total: number;
  currency: string;
  delivery: DeliveryInput;
  paymentReference: string | null;
  paidAtISO: string | null;
  hasReceipt: boolean;
  /** Store orders: the line items. Empty for sticker orders. */
  items: StoreLineItem[];
  /** Sticker orders: number of uploaded files. 0 for store orders. */
  stickerCount: number;
};
