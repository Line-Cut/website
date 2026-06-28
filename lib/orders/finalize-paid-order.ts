import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOwnerStoreEmail } from "@/lib/emails/store-order-notification";
import type { CheckoutInput } from "@/lib/stickers/checkout-schema";
import type { PricedLine, SelectedOptionSnapshot } from "@/lib/store/types";

export type FinalizePaidOrderInput = {
  orderId: string;
  paidAtISO: string;
  provider: string;
  saleId: string | null;
  reference: string | null;
  receiptDocumentUrl: string | null;
  receiptDocumentNumber: string | null;
};

export type FinalizePaidOrderDeps = {
  admin: SupabaseClient;
  sendOwnerEmail: (e: { subject: string; text: string; replyTo: string }) => Promise<void>;
  ownerOrderUrlFor: (id: string) => string;
  now?: () => string;
};

export type FinalizePaidOrderResult =
  | { ok: true; alreadyPaid: boolean }
  | { ok: false; message: string };

export async function finalizePaidOrder(
  input: FinalizePaidOrderInput,
  deps: FinalizePaidOrderDeps,
): Promise<FinalizePaidOrderResult> {
  const nowIso = deps.now ?? (() => new Date().toISOString());

  const { data: rows, error } = await deps.admin
    .from("orders")
    .update({
      payment_status: "paid",
      payment_provider: input.provider,
      provider_sale_id: input.saleId,
      payment_reference: input.reference,
      receipt_document_url: input.receiptDocumentUrl,
      receipt_document_number: input.receiptDocumentNumber,
      paid_at: input.paidAtISO,
      confirmed_at: nowIso(),
    })
    .eq("id", input.orderId)
    .neq("payment_status", "paid")
    .select("*");

  if (error) return { ok: false, message: "db_error" };
  if (!rows || rows.length === 0) return { ok: true, alreadyPaid: true };

  const order = rows[0] as Record<string, unknown>;

  if (order.order_kind === "store") {
    try {
      const { data: items } = await deps.admin
        .from("order_items")
        .select("title_he, title_en, options, quantity, unit_price, line_total")
        .eq("order_id", input.orderId);

      const lines: PricedLine[] = (items ?? []).map(
        (r: Record<string, unknown>) => ({
          productId: "",
          titleHe: r.title_he as string,
          titleEn: r.title_en as string,
          imageUrl: null,
          options: (r.options as SelectedOptionSnapshot[]) ?? [],
          quantity: r.quantity as number,
          unitPrice: r.unit_price as number,
          lineTotal: r.line_total as number,
        }),
      );

      const email = buildOwnerStoreEmail({
        orderId: input.orderId,
        ownerOrderUrl: deps.ownerOrderUrlFor(input.orderId),
        contactName: order.contact_name as string,
        contactEmail: order.contact_email as string,
        contactPhone: order.contact_phone as string | null,
        delivery: deliveryFromOrder(order),
        lines,
        total: order.price_total as number,
        currency: order.price_currency as string,
        locale: "en",
      });
      await deps.sendOwnerEmail(email);
    } catch (err) {
      console.error("[finalizePaidOrder] owner email failed:", err);
    }
  }

  return { ok: true, alreadyPaid: false };
}

/** Reconstruct a CheckoutInput-shaped delivery from an order row. */
function deliveryFromOrder(order: Record<string, unknown>): CheckoutInput {
  return {
    method: order.delivery_method as "pickup" | "shipping",
    firstName: order.contact_first_name as string,
    lastName: order.contact_last_name as string,
    phone: order.contact_phone as string,
    email: order.contact_email as string,
    addressLine1: (order.ship_address_line1 as string | null) ?? undefined,
    addressLine2: (order.ship_address_line2 as string | null) ?? undefined,
    city: (order.ship_city as string | null) ?? undefined,
    postalCode: (order.ship_postal_code as string | null) ?? undefined,
    country: (order.ship_country as string | null) ?? undefined,
    notes: (order.ship_notes as string | null) ?? undefined,
  };
}
