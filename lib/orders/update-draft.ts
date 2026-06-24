import "server-only";

import { parseUpdateDraft } from "@/lib/orders/draft-schema";
import { computePrice } from "@/lib/stickers/pricing";
import { stickerKey } from "@/lib/storage/keys";

export type UpdateDraftDeps = {
  admin: import("@supabase/supabase-js").SupabaseClient;
  presignUpload: (
    key: string,
    opts?: { contentType?: string; expiresIn?: number },
  ) => Promise<string>;
  deleteObjects: (keys: string[]) => Promise<void>;
  /** Signed-in user; ownership is enforced against this. */
  userId: string;
  newId?: () => string;
};

export type UpdateDraftResult =
  | {
      ok: true;
      orderId: string;
      guestToken: string;
      uploads: { stickerId: string; key: string; url: string }[];
    }
  | { ok: false; errors?: Record<string, string>; message?: string };

export async function updateDraft(
  input: unknown,
  deps: UpdateDraftDeps,
): Promise<UpdateDraftResult> {
  const newId = deps.newId ?? (() => crypto.randomUUID());

  const parsed = parseUpdateDraft(input);
  if (!parsed.success) return { ok: false, errors: parsed.errors };
  const { orderId, keepStickerIds, addStickers, copies } = parsed.data;

  // 1. Load + guard: must be the signed-in user's own draft.
  const { data: order, error: orderError } = await deps.admin
    .from("orders")
    .select("id, confirmed_at, guest_token")
    .eq("id", orderId)
    .eq("user_id", deps.userId)
    .maybeSingle();
  if (orderError || !order) return { ok: false, message: "not_found" };
  if (order.confirmed_at != null) return { ok: false, message: "already_finalized" };

  // 2. Load existing stickers and diff against keepStickerIds.
  const { data: existing, error: exErr } = await deps.admin
    .from("order_stickers")
    .select("id, storage_key, sort_index")
    .eq("order_id", orderId);
  if (exErr || !existing) return { ok: false, message: "db_error" };

  const keepSet = new Set(keepStickerIds);
  const removed = existing.filter((s) => !keepSet.has(s.id as string));
  const kept = existing.filter((s) => keepSet.has(s.id as string));

  const finalCount = kept.length + addStickers.length;
  if (finalCount < 1) return { ok: false, message: "no_stickers" };

  // 3. Remove dropped stickers (S3 objects + DB rows).
  if (removed.length > 0) {
    await deps.deleteObjects(removed.map((s) => s.storage_key as string));
    const { error: delErr } = await deps.admin
      .from("order_stickers")
      .delete()
      .in("id", removed.map((s) => s.id as string));
    if (delErr) return { ok: false, message: "db_error" };
  }

  // 4. Add new stickers (rows + presigned PUTs), appended after current max.
  const maxSort = kept.reduce(
    (m, s) => Math.max(m, (s.sort_index as number) ?? 0),
    -1,
  );
  const newRows = addStickers.map((meta, i) => {
    const stickerId = newId();
    const key = stickerKey({ userId: deps.userId, guestToken: "", orderId, stickerId });
    return {
      row: {
        id: stickerId,
        order_id: orderId,
        storage_key: key,
        original_filename: meta.filename,
        width: meta.width,
        height: meta.height,
        bytes: meta.bytes,
        content_type: meta.contentType,
        sort_index: maxSort + 1 + i,
      },
      stickerId,
      key,
    };
  });
  if (newRows.length > 0) {
    const { error: insErr } = await deps.admin
      .from("order_stickers")
      .insert(newRows.map((r) => r.row));
    if (insErr) return { ok: false, message: "db_error" };
  }

  // 5. Re-snapshot price onto the order.
  const breakdown = computePrice(finalCount, copies);
  const { error: updErr } = await deps.admin
    .from("orders")
    .update({
      copies,
      price_sheets: breakdown.totalSheets,
      price_rate: breakdown.perSheetRate,
      price_setup: breakdown.setupFee,
      price_currency: breakdown.currency,
      price_total: breakdown.total,
    })
    .eq("id", orderId);
  if (updErr) return { ok: false, message: "db_error" };

  // 6. Presign PUTs for the added stickers.
  const uploads = await Promise.all(
    newRows.map(async (r) => ({
      stickerId: r.stickerId,
      key: r.key,
      url: await deps.presignUpload(r.key, { contentType: "image/webp" }),
    })),
  );

  return { ok: true, orderId, guestToken: order.guest_token as string, uploads };
}
