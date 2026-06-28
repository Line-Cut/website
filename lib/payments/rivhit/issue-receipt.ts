import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { agorotToShekels } from "@/lib/payments/icredit/money";
import { rivhitPost } from "@/lib/payments/rivhit/client";

export type BuildDocumentNewBodyArgs = {
  apiToken: string;
  orderId: string;
  customer: { firstName: string; lastName: string };
  lines: { description: string; unitPriceShekels: number; quantity: number }[];
  totalShekels: number;
  paymentType: number;
  language: "he" | "en";
};

export function buildDocumentNewBody(args: BuildDocumentNewBodyArgs): Record<string, unknown> {
  return {
    api_token: args.apiToken,
    document_type: 2,
    price_include_vat: true,
    first_name: args.customer.firstName,
    last_name: args.customer.lastName,
    items: args.lines.map((l) => ({
      description: l.description,
      price_nis: l.unitPriceShekels,
      quantity: l.quantity,
    })),
    payments: [{ payment_type: args.paymentType, amount_nis: args.totalShekels }],
    request_reference: args.orderId,
    prevent_duplicates: true,
    language: args.language,
    send_mail: false,
  };
}

export async function issueInvoiceReceipt(args: {
  orderId: string;
  admin: SupabaseClient;
}): Promise<{ documentUrl: string; documentNumber: string } | null> {
  const apiToken = process.env.RIVHIT_API_TOKEN;
  if (!apiToken) {
    console.log("[rivhit] RIVHIT_API_TOKEN is unset — skipping receipt");
    return null;
  }

  const paymentType = Number(process.env.RIVHIT_RECEIPT_PAYMENT_TYPE ?? "3");
  const language = (process.env.RIVHIT_LANGUAGE ?? "he") as "he" | "en";

  try {
    // Load order
    const { data: order, error: orderError } = await args.admin
      .from("orders")
      .select("contact_first_name, contact_last_name, price_total")
      .eq("id", args.orderId)
      .single();

    if (orderError || !order) {
      console.error("[rivhit] Failed to load order", args.orderId, orderError);
      return null;
    }

    // Load order items
    const { data: items, error: itemsError } = await args.admin
      .from("order_items")
      .select("title_he, title_en, unit_price, quantity")
      .eq("order_id", args.orderId);

    if (itemsError || !items) {
      console.error("[rivhit] Failed to load order_items for", args.orderId, itemsError);
      return null;
    }

    const lines = items.map((item) => ({
      description: (item.title_he as string) || (item.title_en as string) || "",
      unitPriceShekels: agorotToShekels(item.unit_price as number),
      quantity: item.quantity as number,
    }));

    const totalShekels = agorotToShekels(order.price_total as number);

    const body = buildDocumentNewBody({
      apiToken,
      orderId: args.orderId,
      customer: {
        firstName: order.contact_first_name as string,
        lastName: order.contact_last_name as string,
      },
      lines,
      totalShekels,
      paymentType,
      language,
    });

    const envelope = await rivhitPost("Document.New", body);

    if (envelope.error_code === 0) {
      const d = envelope.data as { document_link: unknown; document_number: unknown };
      return {
        documentUrl: String(d.document_link),
        documentNumber: String(d.document_number),
      };
    }

    console.error(
      "[rivhit] Document.New failed",
      envelope.error_code,
      envelope.client_message,
      envelope.debug_message,
    );
    return null;
  } catch (err) {
    console.error("[rivhit] Unexpected error issuing receipt", err);
    return null;
  }
}
