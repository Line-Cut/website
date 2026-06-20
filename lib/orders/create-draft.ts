import "server-only";

import { parseDraft } from "@/lib/orders/draft-schema";
import { computePrice } from "@/lib/stickers/pricing";
import { stickerKey } from "@/lib/storage/keys";

export type CreateDraftDeps = {
  admin: import("@supabase/supabase-js").SupabaseClient;
  presignUpload: (
    key: string,
    opts?: { contentType?: string; expiresIn?: number },
  ) => Promise<string>;
  userId?: string | null;
  /** Injectable id generator; defaults to crypto.randomUUID */
  newId?: () => string;
};

export type CreateDraftResult =
  | {
      ok: true;
      orderId: string;
      guestToken: string;
      uploads: { stickerId: string; key: string; url: string }[];
    }
  | { ok: false; errors?: Record<string, string>; message?: string };

export async function createDraft(
  input: unknown,
  deps: CreateDraftDeps,
): Promise<CreateDraftResult> {
  const newId = deps.newId ?? (() => crypto.randomUUID());

  // 1. Validate input
  const parsed = parseDraft(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.errors };
  }
  const { stickers, copies } = parsed.data;

  // 2. Server-authoritative price computation
  const breakdown = computePrice(stickers.length, copies);

  // 3. Insert the draft orders row
  const { data: orderRow, error: orderError } = await deps.admin
    .from("orders")
    .insert({
      user_id: deps.userId ?? null,
      status: "received",
      payment_status: "awaiting_payment",
      contact_name: "",
      contact_email: "",
      delivery_method: "pickup",
      copies,
      price_sheets: breakdown.totalSheets,
      price_rate: breakdown.perSheetRate,
      price_setup: breakdown.setupFee,
      price_currency: breakdown.currency,
      price_total: breakdown.total,
    })
    .select("id, guest_token")
    .single();

  if (orderError || !orderRow) {
    return { ok: false, message: "db_error" };
  }

  const orderId: string = orderRow.id;
  const guestToken: string = orderRow.guest_token;

  // 4. Build sticker rows (collect them first)
  const stickerRows = stickers.map((meta, i) => {
    const stickerId = newId();
    const key = stickerKey({
      userId: deps.userId,
      guestToken,
      orderId,
      stickerId,
    });
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
        sort_index: i,
      },
      stickerId,
      key,
    };
  });

  // 5. Bulk-insert all sticker rows
  const { error: stickersError } = await deps.admin
    .from("order_stickers")
    .insert(stickerRows.map(({ row }) => row));

  if (stickersError) {
    return { ok: false, message: "db_error" };
  }

  // 6. Mint presigned upload URLs
  const uploads = await Promise.all(
    stickerRows.map(async ({ stickerId, key }) => {
      const url = await deps.presignUpload(key, { contentType: "image/webp" });
      return { stickerId, key, url };
    }),
  );

  // 7. Return the result
  return { ok: true, orderId, guestToken, uploads };
}
