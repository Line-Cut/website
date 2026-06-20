import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCheckout } from "@/lib/stickers/checkout-schema";
import type { CheckoutInput } from "@/lib/stickers/checkout-schema";
import { buildOwnerOrderEmail } from "@/lib/emails/order-notification";

export type ConfirmOrderDeps = {
  admin: SupabaseClient;
  objectExists: (key: string) => Promise<boolean>;
  paymentProvider: import("@/lib/payments/provider").PaymentProvider;
  sendOwnerEmail: (email: {
    subject: string;
    text: string;
    replyTo: string;
  }) => Promise<void>;
  ownerFilesUrlFor: (orderId: string) => string;
  /** Injectable ISO timestamp; default new Date().toISOString() */
  now?: () => string;
};

export type ConfirmOrderInput = {
  orderId: string;
  guestToken: string;
  delivery: unknown;
};

export type ConfirmOrderResult =
  | { ok: true; orderId: string; guestToken: string }
  | { ok: false; errors?: Record<string, string>; message?: string };

export async function confirmOrder(
  input: ConfirmOrderInput,
  deps: ConfirmOrderDeps,
): Promise<ConfirmOrderResult> {
  // 1. Validate delivery
  const parsed = parseCheckout(input.delivery);
  if (!parsed.success) {
    return { ok: false, errors: parsed.errors };
  }
  const delivery: CheckoutInput = parsed.data;

  const nowIso = deps.now ?? (() => new Date().toISOString());

  // 2. Load order — both id AND guest_token must match
  const { data: order, error: orderError } = await deps.admin
    .from("orders")
    .select("*")
    .eq("id", input.orderId)
    .eq("guest_token", input.guestToken)
    .maybeSingle();

  if (orderError || !order) {
    return { ok: false, message: "not_found" };
  }

  // Idempotent: already confirmed → return success, no re-charge/re-email
  if (order.confirmed_at != null) {
    return { ok: true, orderId: input.orderId, guestToken: input.guestToken };
  }

  // 3. Load stickers and verify each exists in S3
  const { data: stickers, error: stickersError } = await deps.admin
    .from("order_stickers")
    .select("storage_key")
    .eq("order_id", input.orderId);

  if (stickersError || !stickers || stickers.length === 0) {
    return { ok: false, message: "no_stickers" };
  }

  for (const sticker of stickers) {
    const exists = await deps.objectExists(sticker.storage_key as string);
    if (!exists) {
      return { ok: false, message: "uploads_incomplete" };
    }
  }

  // 4. Payment
  const payResult = await deps.paymentProvider.createCharge({
    orderId: input.orderId,
    amount: order.price_total as number,
    currency: order.price_currency as string,
  });

  if (payResult.status === "failed") {
    return { ok: false, message: "payment_failed" };
  }

  const paymentStatus =
    payResult.status === "paid" ? "paid" : "awaiting_payment";

  // 5. Update order with delivery + contact + payment_status + confirmed_at
  const updatePayload: Record<string, unknown> = {
    contact_name: delivery.fullName,
    contact_email: delivery.email,
    contact_phone: delivery.phone,
    delivery_method: delivery.method,
    ship_address_line1: delivery.method === "shipping" ? (delivery.addressLine1 ?? null) : null,
    ship_address_line2: delivery.method === "shipping" ? (delivery.addressLine2 ?? null) : null,
    ship_city: delivery.method === "shipping" ? (delivery.city ?? null) : null,
    ship_postal_code: delivery.method === "shipping" ? (delivery.postalCode ?? null) : null,
    ship_country: delivery.method === "shipping" ? (delivery.country ?? null) : null,
    notes: delivery.notes ?? null,
    payment_status: paymentStatus,
    confirmed_at: nowIso(),
  };

  const { error: updateError } = await deps.admin
    .from("orders")
    .update(updatePayload)
    .eq("id", input.orderId);

  if (updateError) {
    return { ok: false, message: "db_error" };
  }

  // 6. Send owner notification email (best-effort — failure must NOT fail the order)
  try {
    const email = buildOwnerOrderEmail({
      orderId: input.orderId,
      ownerFilesUrl: deps.ownerFilesUrlFor(input.orderId),
      contactName: delivery.fullName,
      contactEmail: delivery.email,
      contactPhone: delivery.phone,
      delivery,
      copies: order.copies as number,
      stickerCount: stickers.length,
      breakdown: {
        uniqueCount: stickers.length,
        copies: order.copies as number,
        perSheet: 0, // not stored; set to 0 for email snapshot
        perSheetRate: order.price_rate as number,
        sheetsPerSet: 0, // not stored; set to 0 for email snapshot
        totalSheets: order.price_sheets as number,
        sheetsSubtotal: (order.price_sheets as number) * (order.price_rate as number),
        setupFee: order.price_setup as number,
        total: order.price_total as number,
        currency: order.price_currency as string,
      },
      locale: "en",
    });
    await deps.sendOwnerEmail(email);
  } catch (err) {
    // Best-effort: log but never fail the order
    console.error("[confirmOrder] owner email failed:", err);
  }

  // 7. Success
  return { ok: true, orderId: input.orderId, guestToken: input.guestToken };
}
