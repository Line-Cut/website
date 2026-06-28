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
import type { Product, SelectedOptionSnapshot } from "@/lib/store/types";
import { toCheckoutItems, toCheckoutCustomer } from "@/lib/store/checkout-payload";
import type { FinalizePaidOrderInput } from "@/lib/orders/finalize-paid-order";

export type ConfirmStoreOrderDeps = {
  admin: SupabaseClient;
  paymentProvider: import("@/lib/payments/provider").PaymentProvider;
  finalizePaidOrder: (input: FinalizePaidOrderInput) => Promise<{ ok: boolean; alreadyPaid?: boolean }>;
  redirectUrlFor: (guestToken: string, locale: "he" | "en") => string;
  ipnUrl: string;
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
  locale: "he" | "en";
};

export type ConfirmStoreOrderResult =
  | { ok: true; orderId: string; guestToken: string; redirectUrl?: string }
  | {
      ok: false;
      message: string;
      errors?: Record<string, string>;
      removed?: string[];
    };

/**
 * Create-at-confirm store order. No draft row (the cart lives client-side and
 * there are no files to pre-stage). Idempotent via a client-minted
 * clientRequestId backed by a partial-unique index. Delegates payment to the
 * PaymentProvider's hosted checkout — returns a redirectUrl for the iCredit
 * gateway, or ok:true immediately for the mock paid result.
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
    .select(
      "id, guest_token, payment_status, price_total, price_currency, delivery_method, contact_first_name, contact_last_name, contact_email, contact_phone, ship_address_line1, ship_city, ship_postal_code",
    )
    .eq("client_request_id", clientRequestId)
    .maybeSingle();

  if (existing) {
    if (existing.payment_status === "paid") {
      return { ok: true, orderId: existing.id, guestToken: existing.guest_token };
    }
    // Re-issue checkout so a retry resumes payment instead of duplicating the order
    return reissueCheckout(existing, input.locale, deps, nowIso);
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

  // 7. Hosted checkout — provider decides whether to redirect or to charge inline
  return runCheckout({
    orderId,
    guestToken,
    total,
    currency,
    locale: input.locale,
    lines,
    delivery,
    deps,
    nowIso,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run createCheckout and dispatch on the result. Used for both fresh and re-issued orders. */
async function runCheckout({
  orderId,
  guestToken,
  total,
  currency,
  locale,
  lines,
  delivery,
  deps,
  nowIso,
}: {
  orderId: string;
  guestToken: string;
  total: number;
  currency: string;
  locale: "he" | "en";
  lines: import("@/lib/store/types").PricedLine[];
  delivery: CheckoutInput;
  deps: ConfirmStoreOrderDeps;
  nowIso: () => string;
}): Promise<ConfirmStoreOrderResult> {
  const checkoutResult = await deps.paymentProvider.createCheckout({
    orderId,
    amount: total,
    currency,
    locale,
    items: toCheckoutItems(lines, locale),
    customer: toCheckoutCustomer(delivery),
    redirectUrl: deps.redirectUrlFor(guestToken, locale),
    ipnUrl: deps.ipnUrl,
  });

  if (checkoutResult.status === "failed") {
    await deps.admin.from("orders").delete().eq("id", orderId);
    return { ok: false, message: "payment_failed" };
  }

  if (checkoutResult.status === "redirect") {
    // Record the provider token so the IPN can match inbound callbacks
    await deps.admin
      .from("orders")
      .update({
        payment_provider: "icredit",
        payment_reference: checkoutResult.reference,
      })
      .eq("id", orderId);
    return { ok: true, orderId, guestToken, redirectUrl: checkoutResult.url };
  }

  // status === "paid" (mock provider)
  await deps.finalizePaidOrder({
    orderId,
    paidAtISO: nowIso(),
    provider: "mock",
    saleId: checkoutResult.reference,
    reference: checkoutResult.reference,
    receiptDocumentUrl: null,
    receiptDocumentNumber: null,
  });
  return { ok: true, orderId, guestToken };
}

/** Re-issue a checkout for an existing unpaid order (idempotency retry path). */
async function reissueCheckout(
  existing: Record<string, unknown>,
  locale: "he" | "en",
  deps: ConfirmStoreOrderDeps,
  nowIso: () => string,
): Promise<ConfirmStoreOrderResult> {
  const orderId = existing.id as string;
  const guestToken = existing.guest_token as string;

  const { data: itemRows } = await deps.admin
    .from("order_items")
    .select("product_id, title_he, title_en, image_url, options, quantity, unit_price, line_total")
    .eq("order_id", orderId);

  const pricedLines: import("@/lib/store/types").PricedLine[] = (itemRows ?? []).map(
    (r: Record<string, unknown>) => ({
      productId: r.product_id as string,
      titleHe: r.title_he as string,
      titleEn: r.title_en as string,
      imageUrl: r.image_url as string | null,
      options: (r.options as SelectedOptionSnapshot[]) ?? [],
      quantity: r.quantity as number,
      unitPrice: r.unit_price as number,
      lineTotal: r.line_total as number,
    }),
  );

  const reissueDelivery: CheckoutInput = {
    method: existing.delivery_method as "pickup" | "shipping",
    firstName: existing.contact_first_name as string,
    lastName: existing.contact_last_name as string,
    email: existing.contact_email as string,
    phone: existing.contact_phone as string,
    addressLine1: (existing.ship_address_line1 as string | null) ?? undefined,
    city: (existing.ship_city as string | null) ?? undefined,
    postalCode: (existing.ship_postal_code as string | null) ?? undefined,
  };

  return runCheckout({
    orderId,
    guestToken,
    total: existing.price_total as number,
    currency: existing.price_currency as string,
    locale,
    lines: pricedLines,
    delivery: reissueDelivery,
    deps,
    nowIso,
  });
}
