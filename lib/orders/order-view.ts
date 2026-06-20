import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { OrderView } from "@/lib/stickers/types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type OrderRow = {
  id: string;
  guest_token: string;
  status: string;
  payment_status: string;
  confirmed_at: string | null;
  created_at: string;
  copies: number;
  price_sheets: number;
  price_rate: number;
  price_setup: number;
  price_total: number;
  price_currency: string;
  contact_name: string;
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

type StickerCountRow = {
  order_id: string;
};

async function countStickers(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  orderId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("order_stickers")
    .select("order_id")
    .eq("order_id", orderId);

  if (error || !data) return 0;
  return (data as StickerCountRow[]).length;
}

function mapRowToOrderView(row: OrderRow, stickerCount: number): OrderView {
  return {
    orderId: row.id,
    guestToken: row.guest_token,
    status: row.status as OrderView["status"],
    paymentStatus: row.payment_status as OrderView["paymentStatus"],
    createdAtISO: row.confirmed_at ?? row.created_at,
    copies: row.copies,
    breakdown: {
      perSheet: 0,
      sheetsPerSet: 0,
      totalSheets: row.price_sheets,
      perSheetRate: row.price_rate,
      setupFee: row.price_setup,
      sheetsSubtotal: row.price_total - row.price_setup,
      total: row.price_total,
      currency: row.price_currency,
      uniqueCount: stickerCount,
      copies: row.copies,
    },
    delivery: {
      method: row.delivery_method as "pickup" | "shipping",
      fullName: row.contact_name,
      phone: row.contact_phone ?? "",
      email: row.contact_email,
      addressLine1: row.ship_address_line1 ?? undefined,
      addressLine2: row.ship_address_line2 ?? undefined,
      city: row.ship_city ?? undefined,
      postalCode: row.ship_postal_code ?? undefined,
      country: row.ship_country ?? undefined,
      notes: row.ship_notes ?? undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a confirmed order by orderId + guestToken.
 * Drafts (confirmed_at IS NULL) are not viewable.
 * Returns null if not found.
 */
export async function getOrderByGuestToken(
  orderId: string,
  guestToken: string,
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

  const row = data as OrderRow;
  const stickerCount = await countStickers(admin, row.id);
  return mapRowToOrderView(row, stickerCount);
}

/**
 * Fetch a confirmed order by guest_token alone (for the tracking page).
 * Drafts (confirmed_at IS NULL) are not viewable.
 * Returns null if not found.
 */
export async function getOrderByToken(
  token: string,
): Promise<OrderView | null> {
  const admin = createAdminSupabaseClient();

  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("guest_token", token)
    .not("confirmed_at", "is", null)
    .single();

  if (error || !data) return null;

  const row = data as OrderRow;
  const stickerCount = await countStickers(admin, row.id);
  return mapRowToOrderView(row, stickerCount);
}
