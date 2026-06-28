import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOwnerStoreEmail } from "@/lib/emails/store-order-notification";
import type { CheckoutInput } from "@/lib/stickers/checkout-schema";
import type { PricedLine, SelectedOptionSnapshot } from "@/lib/store/types";

export type StorePaidSideEffectsDeps = {
  admin: SupabaseClient;
  sendOwnerEmail: (e: { subject: string; text: string; replyTo: string }) => Promise<void>;
  ownerOrderUrlFor: (id: string) => string;
};

/**
 * Loads the order_items for a paid store order, builds the owner notification
 * email, and sends it. Moved verbatim from finalizePaidOrder — the order_kind
 * guard is dropped because callers only wire this for store orders.
 */
export async function runStorePaidSideEffects(
  order: Record<string, unknown>,
  deps: StorePaidSideEffectsDeps,
): Promise<void> {
  const orderId = order.id as string;

  const { data: items } = await deps.admin
    .from("order_items")
    .select("title_he, title_en, options, quantity, unit_price, line_total")
    .eq("order_id", orderId);

  const lines: PricedLine[] = (items ?? []).map(
    (r: Record<string, unknown>) => ({
      productId: "",
      titleHe: r.title_he as string,
      titleEn: r.title_en as string,
      imageUrl: null,
      options: (r.options as SelectedOptionSnapshot[]) ?? [],
      quantity: r.quantity as number,
      unitPrice: r.unit_price as number,
      lineTotal: r.line_total as number,
    }),
  );

  const email = buildOwnerStoreEmail({
    orderId,
    ownerOrderUrl: deps.ownerOrderUrlFor(orderId),
    contactName: order.contact_name as string,
    contactEmail: order.contact_email as string,
    contactPhone: order.contact_phone as string | null,
    delivery: deliveryFromOrder(order),
    lines,
    total: order.price_total as number,
    currency: order.price_currency as string,
    locale: "en",
  });
  await deps.sendOwnerEmail(email);
}

/** Reconstruct a CheckoutInput-shaped delivery from an order row. */
export function deliveryFromOrder(order: Record<string, unknown>): CheckoutInput {
  return {
    method: order.delivery_method as "pickup" | "shipping",
    firstName: order.contact_first_name as string,
    lastName: order.contact_last_name as string,
    phone: order.contact_phone as string,
    email: order.contact_email as string,
    addressLine1: (order.ship_address_line1 as string | null) ?? undefined,
    addressLine2: (order.ship_address_line2 as string | null) ?? undefined,
    city: (order.ship_city as string | null) ?? undefined,
    postalCode: (order.ship_postal_code as string | null) ?? undefined,
    country: (order.ship_country as string | null) ?? undefined,
    notes: (order.ship_notes as string | null) ?? undefined,
  };
}
