import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { orderPrefix } from "@/lib/storage/keys";

export type DiscardDraftDeps = {
  admin: SupabaseClient;
  deletePrefix: (prefix: string) => Promise<void>;
  userId: string;
};

export async function discardDraft(
  orderId: string,
  deps: DiscardDraftDeps,
): Promise<{ ok: boolean; message?: string }> {
  const { data: order, error } = await deps.admin
    .from("orders")
    .select("id, confirmed_at")
    .eq("id", orderId)
    .eq("user_id", deps.userId)
    .maybeSingle();
  if (error) return { ok: false, message: "db_error" };
  if (!order) return { ok: true }; // idempotent — already gone / not ours
  if (order.confirmed_at != null) return { ok: false, message: "already_finalized" };

  // Drafts are never re-keyed, so the temp prefix is the whole order folder.
  await deps.deletePrefix(
    `${orderPrefix({ userId: deps.userId, guestToken: "", orderId })}/`,
  );

  const { error: delErr } = await deps.admin.from("orders").delete().eq("id", orderId);
  if (delErr) return { ok: false, message: "db_error" };
  return { ok: true };
}
