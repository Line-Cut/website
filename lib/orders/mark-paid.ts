import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReceiptContext } from "@/lib/pdf/receipt-pdf";

// ---------------------------------------------------------------------------
// markOrderPaid — the post-payment STORAGE step, factored out so it can be
// driven by the confirm flow today (mock payment) and, later, by the real
// (non-standard) payment provider's webhook. Self-contained and idempotent:
//   1. copy the order folder from the orders bucket → the paid bucket,
//   2. write the receipt file into the paid bucket order folder,
//   3. record the receipt key on the order row.
// Payment *status/reference/paid_at* are owned by the caller (confirmOrder /
// the future webhook), NOT here.
// ---------------------------------------------------------------------------

export type MarkOrderPaidDeps = {
  admin: SupabaseClient;
  /** Copy the whole order folder orders→paid (idempotent overwrite). */
  copyOrderFolderToPaid: (storagePrefix: string) => Promise<void>;
  /** Build + write the receipt into the paid bucket; returns its S3 key. */
  writeReceipt: (
    storagePrefix: string,
    receipt: ReceiptContext,
  ) => Promise<string>;
};

export type MarkOrderPaidInput = {
  orderId: string;
  storagePrefix: string;
  receipt: ReceiptContext;
};

export type MarkOrderPaidResult =
  | { ok: true; receiptStorageKey: string }
  | { ok: false; message: string };

export async function markOrderPaid(
  input: MarkOrderPaidInput,
  deps: MarkOrderPaidDeps,
): Promise<MarkOrderPaidResult> {
  // 1. Copy the order folder to the paid bucket.
  await deps.copyOrderFolderToPaid(input.storagePrefix);

  // 2. Write the receipt file into the paid bucket order folder.
  const receiptStorageKey = await deps.writeReceipt(
    input.storagePrefix,
    input.receipt,
  );

  // 3. Record the receipt key on the order.
  const { error } = await deps.admin
    .from("orders")
    .update({ receipt_storage_key: receiptStorageKey })
    .eq("id", input.orderId);

  if (error) {
    return { ok: false, message: "db_error" };
  }
  return { ok: true, receiptStorageKey };
}
