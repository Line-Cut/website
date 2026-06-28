import "server-only";

import { buildOwnerOrderEmail } from "@/lib/emails/order-notification";
import { deliveryFromOrder } from "@/lib/orders/store-paid-side-effects";

export type StickerPaidSideEffectsDeps = {
  markOrderPaid: (mp: {
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
  loadStickerCount: (orderId: string) => Promise<number>;
  sendOwnerEmail: (e: {
    subject: string;
    text: string;
    replyTo: string;
  }) => Promise<void>;
  ownerFilesUrlFor: (id: string) => string;
};

/**
 * Post-payment side effects for a sticker order:
 *   1. Copy the order folder to the paid bucket and write the receipt (best-effort).
 *   2. Build and send the sticker owner notification email (best-effort).
 *
 * Both steps are wrapped in independent try/catch so a failure in step 1 does
 * NOT prevent step 2 from running, and neither throw ever propagates.
 */
export async function runStickerPaidSideEffects(
  order: Record<string, unknown>,
  deps: StickerPaidSideEffectsDeps,
): Promise<void> {
  const orderId = order.id as string;

  // Step 1: copy to paid bucket + write receipt (best-effort)
  try {
    await deps.markOrderPaid({
      orderId,
      storagePrefix: order.storage_prefix as string,
      receipt: {
        orderId,
        amount: order.price_total as number,
        currency: order.price_currency as string,
        reference: (order.payment_reference as string | null | undefined) ?? null,
        paidAtISO:
          (order.paid_at as string | null | undefined) ??
          new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[runStickerPaidSideEffects] markOrderPaid failed:", err);
  }

  // Step 2: send owner notification email (best-effort)
  try {
    const stickerCount = await deps.loadStickerCount(orderId);
    const delivery = deliveryFromOrder(order);
    const priceSheets = order.price_sheets as number;
    const priceRate = order.price_rate as number;
    const breakdown = {
      uniqueCount: stickerCount,
      copies: order.copies as number,
      perSheet: 0,
      perSheetRate: priceRate,
      sheetsPerSet: 0,
      totalSheets: priceSheets,
      sheetsSubtotal: priceSheets * priceRate,
      setupFee: order.price_setup as number,
      total: order.price_total as number,
      currency: order.price_currency as string,
    };
    const email = buildOwnerOrderEmail({
      orderId,
      ownerFilesUrl: deps.ownerFilesUrlFor(orderId),
      contactName: order.contact_name as string,
      contactEmail: order.contact_email as string,
      contactPhone: (order.contact_phone as string | null | undefined) ?? null,
      delivery,
      copies: order.copies as number,
      stickerCount,
      breakdown,
      locale: "en",
    });
    await deps.sendOwnerEmail(email);
  } catch (err) {
    console.error("[runStickerPaidSideEffects] owner email failed:", err);
  }
}
