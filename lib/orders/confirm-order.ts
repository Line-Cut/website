import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCheckout } from "@/lib/stickers/checkout-schema";
import type { CheckoutInput } from "@/lib/stickers/checkout-schema";
import { buildOwnerOrderEmail } from "@/lib/emails/order-notification";
import {
  friendlyOrderPrefix,
  friendlyStickerKey,
  metadataKey,
} from "@/lib/storage/keys";
import type { OrderMetadataPdfInput } from "@/lib/pdf/order-metadata-pdf";

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
  /** Paid pipeline (copy orders→paid + receipt). Best-effort; re-runnable. */
  markOrderPaid: (input: {
    orderId: string;
    storagePrefix: string;
    receipt: {
      orderId: string;
      amount: number;
      currency: string;
      reference: string | null;
      paidAtISO: string;
    };
  }) => Promise<{ ok: boolean; receiptStorageKey?: string }>;
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

  // Idempotent: already confirmed → return success, no re-charge/re-email
  if (order.confirmed_at != null) {
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
  //    retry (before confirmed_at is set) re-runs cleanly.
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

  // 5. Payment (mock hosted-checkout → paid; stickers don't redirect today)
  const payResult = await deps.paymentProvider.createCheckout({
    orderId: input.orderId,
    amount: order.price_total as number,
    currency: order.price_currency as string,
    locale: "he",
    items: [{ description: "Stickers order", catalogNumber: input.orderId,
              unitPrice: order.price_total as number, quantity: 1 }],
    customer: { firstName: delivery.firstName, lastName: delivery.lastName,
                email: delivery.email, phone: delivery.phone },
    redirectUrl: "", ipnUrl: "",
  });
  if (payResult.status === "failed") return { ok: false, message: "payment_failed" };
  if (payResult.status === "redirect") return { ok: false, message: "payment_redirect_unsupported" };
  const paid = payResult.status === "paid";
  const paymentStatus = paid ? "paid" : "awaiting_payment";
  const paymentReference = payResult.reference ?? null;
  const paidAtIso = paid ? nowIso() : null;

  const fullName = [delivery.firstName, delivery.lastName]
    .filter(Boolean)
    .join(" ");

  // 6. Single order update. confirmed_at is set here — only after the re-key
  //    and payment succeed — so a failed earlier step re-runs cleanly.
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
    payment_status: paymentStatus,
    payment_reference: paymentReference,
    paid_at: paidAtIso,
    confirmed_at: nowIso(),
  };

  const { error: updateError } = await deps.admin
    .from("orders")
    .update(updatePayload)
    .eq("id", input.orderId);

  if (updateError) {
    return { ok: false, message: "db_error" };
  }

  // 7. Paid pipeline (best-effort): copy the order folder to the paid bucket
  //    and write the receipt. Failure must NOT fail the order — it can be
  //    re-run via markOrderPaid(orderId, storagePrefix) (idempotent).
  if (paid) {
    try {
      await deps.markOrderPaid({
        orderId: input.orderId,
        storagePrefix,
        receipt: {
          orderId: input.orderId,
          amount: order.price_total as number,
          currency: order.price_currency as string,
          reference: paymentReference,
          paidAtISO: paidAtIso ?? nowIso(),
        },
      });
    } catch (err) {
      console.error("[confirmOrder] markOrderPaid failed:", err);
    }
  }

  // 8. Send owner notification email (best-effort — failure must NOT fail the order)
  try {
    const email = buildOwnerOrderEmail({
      orderId: input.orderId,
      ownerFilesUrl: deps.ownerFilesUrlFor(input.orderId),
      contactName: fullName,
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
        sheetsSubtotal:
          (order.price_sheets as number) * (order.price_rate as number),
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

  // 9. Success
  return { ok: true, orderId: input.orderId, guestToken: input.guestToken };
}
