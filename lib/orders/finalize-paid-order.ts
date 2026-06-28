import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  onPaid?: (order: Record<string, unknown>) => Promise<void>;
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

  try {
    await deps.onPaid?.(order);
  } catch (err) {
    console.error("[finalizePaidOrder] onPaid failed:", err);
  }

  return { ok: true, alreadyPaid: false };
}
