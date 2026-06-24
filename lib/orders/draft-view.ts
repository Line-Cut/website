import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceBreakdown } from "@/lib/stickers/types";

export type DraftViewDeps = {
  admin: SupabaseClient;
  userId: string;
  presignDownload: (
    key: string,
    opts?: { expiresIn?: number },
  ) => Promise<string>;
};

export type DraftListItem = {
  orderId: string;
  guestToken: string;
  stickerCount: number;
  copies: number;
  breakdown: PriceBreakdown;
  updatedAtISO: string;
  thumbnailUrl: string | null;
};

const THUMB_TTL = 3600;

export async function getUserDrafts(
  deps: DraftViewDeps,
): Promise<DraftListItem[]> {
  const { data, error } = await deps.admin
    .from("orders")
    .select(
      "id, guest_token, copies, price_sheets, price_rate, price_setup, price_total, price_currency, updated_at, order_stickers(id, storage_key, sort_index)",
    )
    .eq("user_id", deps.userId)
    .is("confirmed_at", null)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];

  return Promise.all(
    (data as Array<Record<string, unknown>>).map(async (row) => {
      const stickers = (
        (row.order_stickers as Array<{ storage_key: string; sort_index: number }>) ?? []
      )
        .slice()
        .sort((a, b) => a.sort_index - b.sort_index);
      const first = stickers[0];
      const thumbnailUrl = first
        ? await deps.presignDownload(first.storage_key, { expiresIn: THUMB_TTL })
        : null;
      return {
        orderId: row.id as string,
        guestToken: row.guest_token as string,
        stickerCount: stickers.length,
        copies: row.copies as number,
        breakdown: {
          uniqueCount: stickers.length,
          copies: row.copies as number,
          perSheet: 0,
          perSheetRate: row.price_rate as number,
          sheetsPerSet: 0,
          totalSheets: row.price_sheets as number,
          sheetsSubtotal: (row.price_total as number) - (row.price_setup as number),
          setupFee: row.price_setup as number,
          total: row.price_total as number,
          currency: row.price_currency as string,
        },
        updatedAtISO: row.updated_at as string,
        thumbnailUrl,
      };
    }),
  );
}

export type DraftEditSticker = {
  id: string;
  storageKey: string;
  filename: string;
  width: number | null;
  height: number | null;
  bytes: number;
  url: string;
};

export type DraftEditData = {
  orderId: string;
  copies: number;
  stickers: DraftEditSticker[];
};

export async function getDraftForEdit(
  orderId: string,
  deps: DraftViewDeps,
): Promise<DraftEditData | null> {
  const { data: order, error } = await deps.admin
    .from("orders")
    .select("id, copies, confirmed_at")
    .eq("id", orderId)
    .eq("user_id", deps.userId)
    .is("confirmed_at", null)
    .maybeSingle();
  if (error || !order) return null;

  const { data: stickers } = await deps.admin
    .from("order_stickers")
    .select("id, storage_key, original_filename, width, height, bytes, sort_index")
    .eq("order_id", orderId)
    .order("sort_index", { ascending: true });

  const list = await Promise.all(
    ((stickers as Array<Record<string, unknown>>) ?? []).map(async (s) => ({
      id: s.id as string,
      storageKey: s.storage_key as string,
      filename: s.original_filename as string,
      width: (s.width as number | null) ?? null,
      height: (s.height as number | null) ?? null,
      bytes: s.bytes as number,
      url: await deps.presignDownload(s.storage_key as string, { expiresIn: THUMB_TTL }),
    })),
  );

  return { orderId: order.id as string, copies: order.copies as number, stickers: list };
}
