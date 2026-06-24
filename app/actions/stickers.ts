"use server";

import { Resend } from "resend";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
import { siteConfig } from "@/lib/site-config";

export async function createOrderDraft(
  input: unknown,
): Promise<CreateDraftResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  const apiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_NOTIFY_EMAIL;
  const fromEmail = process.env.CONTACT_FROM;

  const sendOwnerEmail = async (email: {
    subject: string;
    text: string;
    replyTo: string;
  }): Promise<void> => {
    if (!apiKey || !ownerEmail || !fromEmail) {
      throw new Error(
        "Missing email env vars: RESEND_API_KEY, OWNER_NOTIFY_EMAIL, CONTACT_FROM",
      );
    }
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: ownerEmail,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
    });
    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }
  };

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
