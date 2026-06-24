vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { getUserDrafts, getDraftForEdit } from "@/lib/orders/draft-view";
import type { DraftViewDeps } from "@/lib/orders/draft-view";

const DRAFT_ROW = {
  id: "o1", guest_token: "gt1", copies: 2,
  price_sheets: 4, price_rate: 1000, price_setup: 500, price_total: 4500, price_currency: "ILS",
  updated_at: "2026-06-24T10:00:00.000Z",
  order_stickers: [
    { id: "s2", storage_key: "u_u1/o1/s2.webp", sort_index: 1 },
    { id: "s1", storage_key: "u_u1/o1/s1.webp", sort_index: 0 },
  ],
};

function presign() { return vi.fn(async (k: string) => `https://signed/${k}`); }

describe("getUserDrafts", () => {
  it("maps rows, counts stickers, and presigns the first sticker as thumbnail", async () => {
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ is: () => ({ order: () => Promise.resolve({ data: [DRAFT_ROW], error: null }) }) }) }),
      }),
    };
    const presignDownload = presign();
    const result = await getUserDrafts({ admin: admin as unknown as DraftViewDeps["admin"], userId: "u1", presignDownload });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ orderId: "o1", guestToken: "gt1", stickerCount: 2, copies: 2 });
    expect(result[0].breakdown.total).toBe(4500);
    // first by sort_index is s1
    expect(presignDownload).toHaveBeenCalledWith("u_u1/o1/s1.webp", { expiresIn: 3600 });
    expect(result[0].thumbnailUrl).toBe("https://signed/u_u1/o1/s1.webp");
  });
});

describe("getDraftForEdit", () => {
  it("returns null for a non-owned/confirmed order", async () => {
    const admin = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }) }) };
    const r = await getDraftForEdit("o1", { admin: admin as unknown as DraftViewDeps["admin"], userId: "u1", presignDownload: presign() });
    expect(r).toBeNull();
  });

  it("returns copies + stickers with presigned urls", async () => {
    const order = { id: "o1", copies: 3, confirmed_at: null };
    const stickers = [{ id: "s1", storage_key: "u_u1/o1/s1.webp", original_filename: "a.webp", width: 64, height: 64, bytes: 100, sort_index: 0 }];
    const admin = {
      from: (t: string) => t === "orders"
        ? { select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: () => Promise.resolve({ data: order, error: null }) }) }) }) }) }
        : { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: stickers, error: null }) }) }) },
    };
    const r = await getDraftForEdit("o1", { admin: admin as unknown as DraftViewDeps["admin"], userId: "u1", presignDownload: presign() });
    expect(r).toMatchObject({ orderId: "o1", copies: 3 });
    expect(r!.stickers[0]).toMatchObject({ id: "s1", storageKey: "u_u1/o1/s1.webp", url: "https://signed/u_u1/o1/s1.webp" });
  });
});
