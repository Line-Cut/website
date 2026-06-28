import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getIcreditConfig } from "@/lib/payments/icredit/config";
import { verifySale } from "@/lib/payments/icredit/client";
import { handleIcreditIpn } from "@/lib/payments/icredit/handle-ipn";
import { finalizePaidOrder } from "@/lib/orders/finalize-paid-order";
import { runStorePaidSideEffects } from "@/lib/orders/store-paid-side-effects";
import { runStickerPaidSideEffects } from "@/lib/orders/sticker-paid-side-effects";
import { markOrderPaid as markOrderPaidCore } from "@/lib/orders/mark-paid";
import { copyPrefix, putObject } from "@/lib/storage/s3";
import { receiptKey } from "@/lib/storage/keys";
import { buildPlaceholderReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { issueInvoiceReceipt } from "@/lib/payments/rivhit/issue-receipt";
import { sendOwnerEmail } from "@/lib/emails/send";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) raw[k] = String(v);

  const config = getIcreditConfig();
  const admin = createAdminSupabaseClient();
  const fallbackOn = process.env.RIVHIT_RECEIPT_FALLBACK === "on";

  const result = await handleIcreditIpn(raw, {
    config,
    loadOrder: async (orderId) => {
      const { data } = await admin
        .from("orders")
        .select("id, price_total, payment_status, order_kind")
        .eq("id", orderId)
        .maybeSingle();
      return data ?? null;
    },
    verify: (saleId, totalShekels) =>
      verifySale({ host: config.host!, token: config.token!, saleId, totalAmountShekels: totalShekels }),
    finalize: (a) =>
      finalizePaidOrder(
        {
          orderId: a.orderId,
          paidAtISO: a.paidAtISO,
          provider: "icredit",
          saleId: a.saleId,
          reference: a.reference,
          receiptDocumentUrl: a.receiptDocumentUrl,
          receiptDocumentNumber: a.receiptDocumentNumber,
        },
        {
          admin,
          onPaid: (order) =>
            order.order_kind === "stickers"
              ? runStickerPaidSideEffects(order, {
                  markOrderPaid: (mp) =>
                    markOrderPaidCore(mp, {
                      admin,
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
                  loadStickerCount: async (orderId) => {
                    const { count } = await admin
                      .from("order_stickers")
                      .select("id", { count: "exact", head: true })
                      .eq("order_id", orderId);
                    return count ?? 0;
                  },
                  sendOwnerEmail,
                  ownerFilesUrlFor: (id) =>
                    `${siteConfig.url}/he/admin/orders/${id}/files`,
                })
              : runStorePaidSideEffects(order, {
                  admin,
                  sendOwnerEmail,
                  ownerOrderUrlFor: (id) => `${siteConfig.url}/he/admin/orders/${id}`,
                }),
        },
      ),
    issueFallbackReceipt: fallbackOn
      ? (order) => issueInvoiceReceipt({ orderId: order.id, admin })
      : undefined,
  });

  return new Response(result.body, { status: result.status });
}
