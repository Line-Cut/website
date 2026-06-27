"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  presignUpload,
  objectExists,
  copyObject,
  copyPrefix,
  putObject,
  deletePrefix,
} from "@/lib/storage/s3";
import { receiptKey } from "@/lib/storage/keys";
import { getPaymentProvider } from "@/lib/payments/index";
import { createDraft } from "@/lib/orders/create-draft";
import type { CreateDraftResult } from "@/lib/orders/create-draft";
import { confirmOrder as confirmOrderCore } from "@/lib/orders/confirm-order";
import type { ConfirmOrderResult } from "@/lib/orders/confirm-order";
import { markOrderPaid as markOrderPaidCore } from "@/lib/orders/mark-paid";
import { buildOrderMetadataPdf } from "@/lib/pdf/order-metadata-pdf";
import { buildPlaceholderReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { getCurrentUserFeatureAccess } from "@/lib/auth/feature-access";
import { sendOwnerEmail } from "@/lib/emails/send";
import { siteConfig } from "@/lib/site-config";

/**
 * Access check for the sticker order actions (create/confirm). Defense in depth
 * — the pages redirect too, but actions are callable directly. Gated by the
 * 'stickers' feature (public ⇒ everyone, incl. guests; restricted ⇒ allow-listed
 * signed-in users; admins always pass).
 */
async function checkStickerAccess(): Promise<{
  allowed: boolean;
  user: { id: string; email?: string | null } | null;
}> {
  return getCurrentUserFeatureAccess("stickers");
}

export async function createOrderDraft(
  input: unknown,
): Promise<CreateDraftResult> {
  const { allowed, user } = await checkStickerAccess();
  if (!allowed) return { ok: false, message: "forbidden" };

  return createDraft(input, {
    admin: createAdminSupabaseClient(),
    presignUpload,
    userId: user?.id ?? null,
  });
}

export async function confirmOrder(input: {
  orderId: string;
  guestToken: string;
  delivery: unknown;
}): Promise<ConfirmOrderResult> {
  if (!(await checkStickerAccess()).allowed) {
    return { ok: false, message: "forbidden" };
  }

  return confirmOrderCore(input, {
    admin: createAdminSupabaseClient(),
    objectExists,
    // Re-key + metadata operate on the orders bucket (default).
    copyObject: (srcKey, dstKey) => copyObject(srcKey, dstKey),
    putObject: (key, body, opts) => putObject(key, body, opts),
    deletePrefix: (prefix) => deletePrefix(prefix),
    buildMetadataPdf: buildOrderMetadataPdf,
    paymentProvider: getPaymentProvider(),
    // Paid pipeline: copy the order folder orders→paid and write the receipt.
    markOrderPaid: (mp) =>
      markOrderPaidCore(mp, {
        admin: createAdminSupabaseClient(),
        copyOrderFolderToPaid: (prefix) =>
          copyPrefix(`${prefix}/`, `${prefix}/`, {
            srcBucket: "orders",
            dstBucket: "paid",
          }),
        writeReceipt: async (prefix, receipt) => {
          const key = receiptKey(prefix);
          const bytes = await buildPlaceholderReceiptPdf(receipt);
          await putObject(key, bytes, {
            contentType: "application/pdf",
            bucket: "paid",
          });
          return key;
        },
      }),
    sendOwnerEmail,
    ownerFilesUrlFor: (id) => `${siteConfig.url}/he/admin/orders/${id}/files`,
  });
}
