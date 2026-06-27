import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/i18n";
import type {
  OrderView,
  StickerOrderView,
  StoreOrderView,
  PriceBreakdown,
} from "@/lib/orders/types";
import {
  ORDER_ITEM_COLUMNS,
  mapStoreItems,
  type OrderItemRow,
} from "@/lib/orders/store-line-items";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

type OrderRow = {
  id: string;
  guest_token: string;
  order_kind: string;
  status: string;
  payment_status: string;
  confirmed_at: string | null;
  created_at: string;
  copies: number | null;
  price_sheets: number | null;
  price_rate: number | null;
  price_setup: number | null;
  price_total: number;
  price_currency: string;
  contact_name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_phone: string | null;
  contact_email: string;
  delivery_method: string;
  ship_address_line1: string | null;
  ship_address_line2: string | null;
  ship_city: string | null;
  ship_postal_code: string | null;
  ship_country: string | null;
  ship_notes: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function baseFields(row: OrderRow) {
  return {
    orderId: row.id,
    guestToken: row.guest_token,
    status: row.status as OrderView["status"],
    paymentStatus: row.payment_status as OrderView["paymentStatus"],
    createdAtISO: row.confirmed_at ?? row.created_at,
    total: row.price_total,
    currency: row.price_currency,
    delivery: {
      method: row.delivery_method as "pickup" | "shipping",
      // Prefer the split columns; fall back to the legacy full name for rows
      // written before the split (whole name lands in firstName).
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
    },
  } as const;
}

function stickerBreakdown(row: OrderRow, uniqueCount: number): PriceBreakdown {
  const setupFee = row.price_setup ?? 0;
  return {
    perSheet: 0,
    sheetsPerSet: 0,
    totalSheets: row.price_sheets ?? 0,
    perSheetRate: row.price_rate ?? 0,
    setupFee,
    sheetsSubtotal: row.price_total - setupFee,
    total: row.price_total,
    currency: row.price_currency,
    uniqueCount,
    copies: row.copies ?? 0,
  };
}

function toStickerView(row: OrderRow, uniqueCount: number): StickerOrderView {
  return {
    ...baseFields(row),
    kind: "stickers",
    copies: row.copies ?? 0,
    breakdown: stickerBreakdown(row, uniqueCount),
  };
}

function toStoreView(row: OrderRow, items: OrderItemRow[], locale: Locale): StoreOrderView {
  return { ...baseFields(row), kind: "store", items: mapStoreItems(items, locale) };
}

// ---------------------------------------------------------------------------
// Admin-client reads (guest token / tracking)
// ---------------------------------------------------------------------------

async function buildViewWithAdmin(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  row: OrderRow,
  locale: Locale,
): Promise<OrderView> {
  if (row.order_kind === "store") {
    const { data: items } = await admin
      .from("order_items")
      .select(ORDER_ITEM_COLUMNS)
      .eq("order_id", row.id)
      .order("sort_index", { ascending: true });
    return toStoreView(row, (items ?? []) as OrderItemRow[], locale);
  }
  const { data: stickers } = await admin
    .from("order_stickers")
    .select("order_id")
    .eq("order_id", row.id);
  return toStickerView(row, stickers?.length ?? 0);
}

/**
 * Fetch a confirmed order by orderId + guestToken.
 * Drafts (confirmed_at IS NULL) are not viewable. Returns null if not found.
 */
export async function getOrderByGuestToken(
  orderId: string,
  guestToken: string,
  locale: Locale,
): Promise<OrderView | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("guest_token", guestToken)
    .not("confirmed_at", "is", null)
    .single();
  if (error || !data) return null;
  return buildViewWithAdmin(admin, data as OrderRow, locale);
}

/**
 * Fetch a confirmed order by guest_token alone (for the tracking page).
 * Drafts (confirmed_at IS NULL) are not viewable. Returns null if not found.
 */
export async function getOrderByToken(
  token: string,
  locale: Locale,
): Promise<OrderView | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("guest_token", token)
    .not("confirmed_at", "is", null)
    .single();
  if (error || !data) return null;
  return buildViewWithAdmin(admin, data as OrderRow, locale);
}

// ---------------------------------------------------------------------------
// RLS-scoped read (account orders)
// ---------------------------------------------------------------------------

/**
 * Fetch all confirmed orders for a logged-in user via the RLS-scoped server
 * client (only the user's own rows). Drafts are excluded. Embeds both child
 * relations so sticker and store orders map without extra round-trips.
 */
export async function getUserOrders(locale: Locale): Promise<OrderView[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`*, order_stickers(order_id), order_items(${ORDER_ITEM_COLUMNS})`)
    .not("confirmed_at", "is", null)
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  return (
    data as Array<
      OrderRow & {
        order_stickers?: { order_id: string }[];
        order_items?: OrderItemRow[];
      }
    >
  ).map((row) =>
    row.order_kind === "store"
      ? toStoreView(row, row.order_items ?? [], locale)
      : toStickerView(row, row.order_stickers?.length ?? 0),
  );
}
