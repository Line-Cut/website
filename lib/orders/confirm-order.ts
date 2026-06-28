import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCheckout } from "@/lib/stickers/checkout-schema";
import type { CheckoutInput } from "@/lib/stickers/checkout-schema";
import {
  friendlyOrderPrefix,
  friendlyStickerKey,
  metadataKey,
} from "@/lib/storage/keys";
import type { OrderMetadataPdfInput } from "@/lib/pdf/order-metadata-pdf";
import type { FinalizePaidOrderInput } from "@/lib/orders/finalize-paid-order";

export type ConfirmOrderDeps = {
  admin: SupabaseClient;
  objectExists: (key: string) => Promise<boolean>;
  /** Copy a single object within the orders bucket (re-key). */
  copyObject: (srcKey: string, dstKey: string) => Promise<void>;
  /** Write bytes into the orders bucket (metadata PDF). */
  putObject: (
    key: string,
    body: Uint8Array | string,
    opts?: { contentType?: string },
  ) => Promise<void>;
  /** Delete a prefix in the orders bucket (temp upload cleanup). */
  deletePrefix: (prefix: string) => Promise<void>;
  buildMetadataPdf: (input: OrderMetadataPdfInput) => Promise<Uint8Array>;
  paymentProvider: import("@/lib/payments/provider").PaymentProvider;
  /** Finalize a paid order (idempotent DB update + sticker side effects via onPaid). */
  finalizePaidOrder: (input: FinalizePaidOrderInput) => Promise<{ ok: boolean; alreadyPaid?: boolean }>;
  /** Build the absolute redirect/thank-you URL for the given guest token and locale. */
  redirectUrlFor: (guestToken: string, locale: "he" | "en") => string;
  /** Absolute URL of the IPN webhook endpoint. */
  ipnUrl: string;
  /** Injectable ISO timestamp; default new Date().toISOString() */
  now?: () => string;
};

export type ConfirmOrderInput = {
  orderId: string;
  guestToken: string;
  delivery: unknown;
  locale: "he" | "en";
};

export type ConfirmOrderResult =
  | { ok: true; orderId: string; guestToken: string; redirectUrl?: string }
  | { ok: false; errors?: Record<string, string>; message?: string };

/** Parent "directory" prefix of an S3 key (e.g. "g_t/ord/s1.webp" → "g_t/ord/"). */
function parentPrefix(key: string): string {
  const i = key.lastIndexOf("/");
  return i >= 0 ? key.slice(0, i + 1) : "";
}

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

  // Idempotent: already paid → return success (no re-charge).
  // An order with payment_status "awaiting_payment" (or null) resumes — re-runs
  // the re-key (idempotent) and re-issues a checkout.
  if (order.payment_status === "paid") {
    return { ok: true, orderId: input.orderId, guestToken: input.guestToken };
  }

  // 3. Load stickers (id + key) and verify each exists in S3
  const { data: stickers, error: stickersError } = await deps.admin
    .from("order_stickers")
    .select("id, storage_key")
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

  // 4. Re-key into the friendly folder <orderId>-<first>-<last>-<phone> within
  //    the orders bucket, write the metadata PDF, and drop the temp prefix.
  //    Idempotent: stickers already at their friendly key are skipped, so a
  //    retry (before payment completes) re-runs cleanly.
  const storagePrefix = friendlyOrderPrefix({
    orderId: order.id as string,
    firstName: delivery.firstName,
    lastName: delivery.lastName,
    phone: delivery.phone,
  });

  const tempPrefixes = new Set<string>();
  for (const sticker of stickers) {
    const oldKey = sticker.storage_key as string;
    const newKey = friendlyStickerKey(storagePrefix, sticker.id as string);
    if (oldKey === newKey) continue; // already re-keyed
    await deps.copyObject(oldKey, newKey);
    const { error: keyErr } = await deps.admin
      .from("order_stickers")
      .update({ storage_key: newKey })
      .eq("id", sticker.id as string);
    if (keyErr) {
      return { ok: false, message: "db_error" };
    }
    tempPrefixes.add(parentPrefix(oldKey));
  }

  // metadata.pdf (client details) under the friendly prefix
  const pdfBytes = await deps.buildMetadataPdf({
    orderId: order.id as string,
    delivery,
    copies: order.copies as number,
    stickerCount: stickers.length,
    createdAtISO: nowIso(),
  });
  await deps.putObject(metadataKey(storagePrefix), pdfBytes, {
    contentType: "application/pdf",
  });

  // remove temp upload prefixes (never the friendly one)
  for (const prefix of tempPrefixes) {
    if (prefix && !prefix.startsWith(storagePrefix)) {
      await deps.deletePrefix(prefix);
    }
  }

  const fullName = [delivery.firstName, delivery.lastName]
    .filter(Boolean)
    .join(" ");

  // 5. Update order with contact fields + storage_prefix.
  //    Payment fields (confirmed_at, payment_status, paid_at) are set later
  //    by finalizePaidOrder (paid/IPN path) so a failed payment leaves the
  //    order as a recoverable draft.
  const updatePayload: Record<string, unknown> = {
    contact_name: fullName,
    contact_first_name: delivery.firstName,
    contact_last_name: delivery.lastName,
    contact_email: delivery.email,
    contact_phone: delivery.phone,
    delivery_method: delivery.method,
    ship_address_line1:
      delivery.method === "shipping" ? (delivery.addressLine1 ?? null) : null,
    ship_address_line2:
      delivery.method === "shipping" ? (delivery.addressLine2 ?? null) : null,
    ship_city: delivery.method === "shipping" ? (delivery.city ?? null) : null,
    ship_postal_code:
      delivery.method === "shipping" ? (delivery.postalCode ?? null) : null,
    ship_country:
      delivery.method === "shipping" ? (delivery.country ?? null) : null,
    ship_notes: delivery.notes ?? null,
    storage_prefix: storagePrefix,
  };

  const { error: updateError } = await deps.admin
    .from("orders")
    .update(updatePayload)
    .eq("id", input.orderId);

  if (updateError) {
    return { ok: false, message: "db_error" };
  }

  // 6. Hosted checkout — provider decides redirect, inline-paid (mock), or failed.
  const payResult = await deps.paymentProvider.createCheckout({
    orderId: input.orderId,
    amount: order.price_total as number,
    currency: order.price_currency as string,
    locale: input.locale,
    items: [
      {
        description: `Stickers order (${order.copies as number} copies)`,
        catalogNumber: input.orderId,
        unitPrice: order.price_total as number,
        quantity: 1,
      },
    ],
    customer: {
      firstName: delivery.firstName,
      lastName: delivery.lastName,
      email: delivery.email,
      phone: delivery.phone,
    },
    redirectUrl: deps.redirectUrlFor(input.guestToken, input.locale),
    ipnUrl: deps.ipnUrl,
  });

  if (payResult.status === "failed") {
    // No rollback — order is a draft; the buyer can retry.
    return { ok: false, message: "payment_failed" };
  }

  if (payResult.status === "redirect") {
    // Record the provider token so the IPN can match inbound callbacks
    await deps.admin
      .from("orders")
      .update({
        payment_provider: "icredit",
        payment_reference: payResult.reference,
      })
      .eq("id", input.orderId);
    return {
      ok: true,
      orderId: input.orderId,
      guestToken: input.guestToken,
      redirectUrl: payResult.url,
    };
  }

  // status === "paid" (mock provider) — finalize inline
  await deps.finalizePaidOrder({
    orderId: input.orderId,
    paidAtISO: nowIso(),
    provider: "mock",
    saleId: payResult.reference,
    reference: payResult.reference,
    receiptDocumentUrl: null,
    receiptDocumentNumber: null,
  });
  return { ok: true, orderId: input.orderId, guestToken: input.guestToken };
}
