import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCheckout } from "@/lib/stickers/checkout-schema";
import type { CheckoutInput } from "@/lib/stickers/checkout-schema";
import { parseCartItems } from "@/lib/store/cart-schema";
import { computeStoreTotals } from "@/lib/store/pricing";
import {
  PRODUCT_COLUMNS,
  rowToProduct,
  type ProductRow,
} from "@/lib/store/product-row";
import { buildOwnerStoreEmail } from "@/lib/emails/store-order-notification";
import type { Product } from "@/lib/store/types";

export type ConfirmStoreOrderDeps = {
  admin: SupabaseClient;
  paymentProvider: import("@/lib/payments/provider").PaymentProvider;
  sendOwnerEmail: (email: {
    subject: string;
    text: string;
    replyTo: string;
  }) => Promise<void>;
  ownerOrderUrlFor: (orderId: string) => string;
  /** null = guest order; otherwise the signed-in user's id. */
  userId?: string | null;
  /** Injectable ISO timestamp; default new Date().toISOString() */
  now?: () => string;
};

export type ConfirmStoreOrderInput = {
  items: unknown;
  delivery: unknown;
  clientRequestId: string;
};

export type ConfirmStoreOrderResult =
  | { ok: true; orderId: string; guestToken: string }
  | {
      ok: false;
      message: string;
      errors?: Record<string, string>;
      removed?: string[];
    };

/**
 * Create-at-confirm store order. No draft row (the cart lives client-side and
 * there are no files to pre-stage). Idempotent via a client-minted
 * clientRequestId backed by a partial-unique index. Reuses the delivery schema,
 * payment provider, and owner email; skips ALL sticker S3/packing/PDF steps.
 */
export async function confirmStoreOrder(
  input: ConfirmStoreOrderInput,
  deps: ConfirmStoreOrderDeps,
): Promise<ConfirmStoreOrderResult> {
  const nowIso = deps.now ?? (() => new Date().toISOString());

  // 0. Client request id (idempotency key)
  const clientRequestId =
    typeof input.clientRequestId === "string" ? input.clientRequestId.trim() : "";
  if (!clientRequestId) return { ok: false, message: "invalid_request" };

  // 1. Idempotency: a prior submit with this key returns the same order
  const { data: existing } = await deps.admin
    .from("orders")
    .select("id, guest_token")
    .eq("client_request_id", clientRequestId)
    .maybeSingle();
  if (existing) {
    return { ok: true, orderId: existing.id, guestToken: existing.guest_token };
  }

  // 2. Validate delivery + cart
  const parsedDelivery = parseCheckout(input.delivery);
  if (!parsedDelivery.success) {
    return { ok: false, message: "invalid_delivery", errors: parsedDelivery.errors };
  }
  const delivery: CheckoutInput = parsedDelivery.data;

  const parsedCart = parseCartItems(input.items);
  if (!parsedCart.success) return { ok: false, message: "invalid_cart" };
  const items = parsedCart.data;

  // 3. Load active products + reject unavailable ones
  const ids = [...new Set(items.map((i) => i.productId))];
  const { data: rows, error: prodErr } = await deps.admin
    .from("products")
    .select(PRODUCT_COLUMNS)
    .in("id", ids)
    .eq("status", "active");
  if (prodErr) return { ok: false, message: "db_error" };

  const products = (rows as unknown as ProductRow[]).map(rowToProduct);
  const map = new Map<string, Product>(products.map((p) => [p.id, p]));
  const removed = ids.filter((id) => !map.has(id));
  if (removed.length) return { ok: false, message: "items_unavailable", removed };

  // 4. Server-authoritative pricing
  const priced = computeStoreTotals(map, items);
  if (!priced.ok) return { ok: false, message: priced.error.code };
  const { lines, total, currency } = priced.totals;

  const fullName = [delivery.firstName, delivery.lastName].filter(Boolean).join(" ");
  const shipping = delivery.method === "shipping";

  // 5. Insert the order (confirmed_at null until payment succeeds)
  const { data: orderRow, error: orderErr } = await deps.admin
    .from("orders")
    .insert({
      order_kind: "store",
      client_request_id: clientRequestId,
      user_id: deps.userId ?? null,
      status: "received",
      payment_status: "awaiting_payment",
      contact_name: fullName,
      contact_first_name: delivery.firstName,
      contact_last_name: delivery.lastName,
      contact_email: delivery.email,
      contact_phone: delivery.phone,
      delivery_method: delivery.method,
      ship_address_line1: shipping ? (delivery.addressLine1 ?? null) : null,
      ship_address_line2: shipping ? (delivery.addressLine2 ?? null) : null,
      ship_city: shipping ? (delivery.city ?? null) : null,
      ship_postal_code: shipping ? (delivery.postalCode ?? null) : null,
      ship_country: shipping ? (delivery.country ?? null) : null,
      ship_notes: delivery.notes ?? null,
      price_currency: currency,
      price_total: total,
    })
    .select("id, guest_token")
    .single();

  if (orderErr || !orderRow) {
    // Lost a race on the idempotency key → return the winner's order
    if ((orderErr as { code?: string } | null)?.code === "23505") {
      const { data: dup } = await deps.admin
        .from("orders")
        .select("id, guest_token")
        .eq("client_request_id", clientRequestId)
        .maybeSingle();
      if (dup) return { ok: true, orderId: dup.id, guestToken: dup.guest_token };
    }
    return { ok: false, message: "db_error" };
  }

  const orderId: string = orderRow.id;
  const guestToken: string = orderRow.guest_token;

  // 6. Insert the line items (snapshots survive product archival/deletion)
  const itemRows = lines.map((line, i) => ({
    order_id: orderId,
    product_id: line.productId,
    title_he: line.titleHe,
    title_en: line.titleEn,
    image_url: line.imageUrl,
    options: line.options,
    quantity: line.quantity,
    unit_price: line.unitPrice,
    line_total: line.lineTotal,
    sort_index: i,
  }));
  const { error: itemsErr } = await deps.admin.from("order_items").insert(itemRows);
  if (itemsErr) {
    // Roll back the orphan order so a retry can reuse the same request id
    await deps.admin.from("orders").delete().eq("id", orderId);
    return { ok: false, message: "db_error" };
  }

  // 7. Payment (mock returns paid today). On failure roll the order back so the
  //    buyer can retry — cascade removes the line items.
  const payResult = await deps.paymentProvider.createCharge({
    orderId,
    amount: total,
    currency,
  });
  if (payResult.status === "failed") {
    await deps.admin.from("orders").delete().eq("id", orderId);
    return { ok: false, message: "payment_failed" };
  }

  const paid = payResult.status === "paid";
  const paymentStatus = paid ? "paid" : "awaiting_payment";
  const paymentReference =
    "reference" in payResult ? (payResult.reference ?? null) : null;
  const paidAtIso = paid ? nowIso() : null;

  // 8. Finalize — confirmed_at is set last so a failed earlier step re-runs cleanly
  const { error: updateErr } = await deps.admin
    .from("orders")
    .update({
      payment_status: paymentStatus,
      payment_reference: paymentReference,
      paid_at: paidAtIso,
      confirmed_at: nowIso(),
    })
    .eq("id", orderId);
  if (updateErr) return { ok: false, message: "db_error" };

  // 9. Owner email (best-effort — failure must NOT fail the order)
  try {
    const email = buildOwnerStoreEmail({
      orderId,
      ownerOrderUrl: deps.ownerOrderUrlFor(orderId),
      contactName: fullName,
      contactEmail: delivery.email,
      contactPhone: delivery.phone,
      delivery,
      lines,
      total,
      currency,
      locale: "en",
    });
    await deps.sendOwnerEmail(email);
  } catch (err) {
    console.error("[confirmStoreOrder] owner email failed:", err);
  }

  return { ok: true, orderId, guestToken };
}
