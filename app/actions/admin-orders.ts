"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/auth/admin-access";
import type { Locale } from "@/lib/i18n";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type AdminOrderSummary,
  type AdminOrderDetail,
} from "@/lib/orders/admin-types";
import type {
  OrderKind,
  OrderStatus,
  PaymentStatus,
  DeliveryInput,
} from "@/lib/orders/types";
import {
  ORDER_ITEM_COLUMNS,
  mapStoreItems,
  type OrderItemRow,
} from "@/lib/orders/store-line-items";

type CountRel = { count: number }[] | null;

type SummaryRow = {
  id: string;
  guest_token: string;
  order_kind: OrderKind;
  status: OrderStatus;
  payment_status: PaymentStatus;
  created_at: string;
  confirmed_at: string | null;
  contact_name: string;
  contact_email: string;
  price_total: number;
  price_currency: string;
  order_stickers: CountRel;
  order_items: CountRel;
};

export async function listOrdersAdmin(filters?: {
  status?: string;
  kind?: string;
}): Promise<AdminOrderSummary[]> {
  if (!(await isCurrentUserAdmin())) return [];
  const admin = createAdminSupabaseClient();

  let query = admin
    .from("orders")
    .select(
      "id, guest_token, order_kind, status, payment_status, created_at, confirmed_at, contact_name, contact_email, price_total, price_currency, order_stickers(count), order_items(count)",
    )
    .not("confirmed_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters?.status && ORDER_STATUSES.includes(filters.status as OrderStatus)) {
    query = query.eq("status", filters.status);
  }
  if (filters?.kind === "stickers" || filters?.kind === "store") {
    query = query.eq("order_kind", filters.kind);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as unknown as SummaryRow[]).map((row) => ({
    orderId: row.id,
    guestToken: row.guest_token,
    kind: row.order_kind,
    status: row.status,
    paymentStatus: row.payment_status,
    createdAtISO: row.confirmed_at ?? row.created_at,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    total: row.price_total,
    currency: row.price_currency,
    itemCount:
      row.order_kind === "store"
        ? (row.order_items?.[0]?.count ?? 0)
        : (row.order_stickers?.[0]?.count ?? 0),
  }));
}

type DetailRow = {
  id: string;
  guest_token: string;
  order_kind: OrderKind;
  status: OrderStatus;
  payment_status: PaymentStatus;
  created_at: string;
  confirmed_at: string | null;
  contact_name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  delivery_method: string;
  ship_address_line1: string | null;
  ship_address_line2: string | null;
  ship_city: string | null;
  ship_postal_code: string | null;
  ship_country: string | null;
  ship_notes: string | null;
  price_total: number;
  price_currency: string;
  payment_reference: string | null;
  paid_at: string | null;
  receipt_storage_key: string | null;
};

export async function getOrderAdmin(
  orderId: string,
  locale: Locale,
): Promise<AdminOrderDetail | null> {
  if (!(await isCurrentUserAdmin())) return null;
  const admin = createAdminSupabaseClient();

  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as DetailRow;

  const delivery: DeliveryInput = {
    method: row.delivery_method as "pickup" | "shipping",
    firstName: row.contact_first_name ?? row.contact_name,
    lastName: row.contact_last_name ?? "",
    phone: row.contact_phone ?? "",
    email: row.contact_email,
    addressLine1: row.ship_address_line1 ?? undefined,
    addressLine2: row.ship_address_line2 ?? undefined,
    city: row.ship_city ?? undefined,
    postalCode: row.ship_postal_code ?? undefined,
    country: row.ship_country ?? undefined,
    notes: row.ship_notes ?? undefined,
  };

  let items: AdminOrderDetail["items"] = [];
  let stickerCount = 0;

  if (row.order_kind === "store") {
    const { data: itemRows } = await admin
      .from("order_items")
      .select(ORDER_ITEM_COLUMNS)
      .eq("order_id", orderId)
      .order("sort_index", { ascending: true });
    items = mapStoreItems((itemRows ?? []) as OrderItemRow[], locale);
  } else {
    const { count } = await admin
      .from("order_stickers")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    stickerCount = count ?? 0;
  }

  return {
    orderId: row.id,
    guestToken: row.guest_token,
    kind: row.order_kind,
    status: row.status,
    paymentStatus: row.payment_status,
    createdAtISO: row.confirmed_at ?? row.created_at,
    total: row.price_total,
    currency: row.price_currency,
    delivery,
    paymentReference: row.payment_reference,
    paidAtISO: row.paid_at,
    hasReceipt: Boolean(row.receipt_storage_key),
    items,
    stickerCount,
  };
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  if (!ORDER_STATUSES.includes(status as OrderStatus)) {
    return { ok: false, message: "invalid_status" };
  }
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("orders")
    .update({ status })
    .eq("id", orderId);
  if (error) return { ok: false, message: "db_error" };
  return { ok: true };
}

/**
 * Manual payment-status control — the bridge until a real gateway lands. Setting
 * 'paid' stamps paid_at; an optional reference records the transaction id. The
 * future gateway webhook can write the same fields directly.
 */
export async function updatePaymentStatus(
  orderId: string,
  paymentStatus: string,
  reference?: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "forbidden" };
  if (!PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)) {
    return { ok: false, message: "invalid_status" };
  }
  const admin = createAdminSupabaseClient();
  const payload: Record<string, unknown> = { payment_status: paymentStatus };
  if (reference !== undefined) payload.payment_reference = reference || null;
  if (paymentStatus === "paid") payload.paid_at = new Date().toISOString();
  const { error } = await admin.from("orders").update(payload).eq("id", orderId);
  if (error) return { ok: false, message: "db_error" };
  return { ok: true };
}
