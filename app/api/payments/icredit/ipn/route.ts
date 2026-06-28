import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getIcreditConfig } from "@/lib/payments/icredit/config";
import { verifySale } from "@/lib/payments/icredit/client";
import { handleIcreditIpn } from "@/lib/payments/icredit/handle-ipn";
import { finalizePaidOrder } from "@/lib/orders/finalize-paid-order";
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
        .select("id, price_total, payment_status")
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
          sendOwnerEmail,
          ownerOrderUrlFor: (id) => `${siteConfig.url}/he/admin/orders/${id}`,
        },
      ),
    issueFallbackReceipt: fallbackOn
      ? (order) => issueInvoiceReceipt({ orderId: order.id, admin })
      : undefined,
  });

  return new Response(result.body, { status: result.status });
}
