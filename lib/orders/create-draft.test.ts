// Mock "server-only" at the top level so the module can be imported in tests
vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { computePrice } from "@/lib/stickers/pricing";
import { createDraft } from "@/lib/orders/create-draft";
import type { CreateDraftDeps } from "@/lib/orders/create-draft";

// ---------------------------------------------------------------------------
// Fake builder helpers
// ---------------------------------------------------------------------------

function makeIdGen(...ids: string[]) {
  let i = 0;
  return () => ids[i++] ?? `fallback-${i}`;
}

/** Build a fake Supabase admin client with injectable responses. */
function makeFakeAdmin({
  orderResult = {
    data: { id: "order-1", guest_token: "gt_1" },
    error: null,
  },
  stickersResult = { error: null },
}: {
  orderResult?: { data: { id: string; guest_token: string } | null; error: { message: string } | null };
  stickersResult?: { error: { message: string } | null };
} = {}) {
  // Capture calls for assertion
  const insertedOrderPayloads: unknown[] = [];
  const insertedStickerRows: unknown[] = [];

  const admin = {
    _insertedOrderPayloads: insertedOrderPayloads,
    _insertedStickerRows: insertedStickerRows,
    from(table: string) {
      if (table === "orders") {
        return {
          insert(payload: unknown) {
            insertedOrderPayloads.push(payload);
            return {
              select(_cols: string) {
                return {
                  single() {
                    return Promise.resolve(orderResult);
                  },
                };
              },
            };
          },
        };
      }
      if (table === "order_stickers") {
        return {
          insert(rows: unknown) {
            insertedStickerRows.push(rows);
            return Promise.resolve(stickersResult);
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return admin;
}

function makeFakePresign() {
  return vi.fn(async (key: string) => `https://signed/${key}`);
}

// ---------------------------------------------------------------------------
// Valid input fixtures
// ---------------------------------------------------------------------------

const stickerA = {
  filename: "a.webp",
  bytes: 1024,
  contentType: "image/webp",
  width: 512,
  height: 512,
};
const stickerB = {
  filename: "b.webp",
  bytes: 2048,
  contentType: "image/webp",
  width: 256,
  height: 256,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createDraft", () => {
  it("returns ok result with correct orderId, guestToken, and uploads", async () => {
    const admin = makeFakeAdmin();
    const presignUpload = makeFakePresign();

    const result = await createDraft(
      { stickers: [stickerA, stickerB], copies: 2 },
      {
        admin: admin as unknown as CreateDraftDeps["admin"],
        presignUpload,
        userId: null,
        newId: makeIdGen("s1", "s2"),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      orderId: "order-1",
      guestToken: "gt_1",
    });

    const { uploads } = result as { ok: true; uploads: unknown[] };
    expect(uploads).toHaveLength(2);
  });

  it("builds guest S3 keys (g_<guestToken>) when no userId", async () => {
    const admin = makeFakeAdmin();
    const presignUpload = makeFakePresign();

    const result = await createDraft(
      { stickers: [stickerA, stickerB], copies: 1 },
      {
        admin: admin as unknown as CreateDraftDeps["admin"],
        presignUpload,
        userId: null,
        newId: makeIdGen("s1", "s2"),
      },
    );

    const { uploads } = result as {
      ok: true;
      uploads: { stickerId: string; key: string; url: string }[];
    };

    expect(uploads[0].key).toBe("g_gt_1/order-1/s1.webp");
    expect(uploads[1].key).toBe("g_gt_1/order-1/s2.webp");
    expect(uploads[0].url).toBe("https://signed/g_gt_1/order-1/s1.webp");
  });

  it("builds user S3 keys (u_<userId>) when userId is present", async () => {
    const admin = makeFakeAdmin();
    const presignUpload = makeFakePresign();

    const result = await createDraft(
      { stickers: [stickerA], copies: 1 },
      {
        admin: admin as unknown as CreateDraftDeps["admin"],
        presignUpload,
        userId: "user-abc",
        newId: makeIdGen("s1"),
      },
    );

    const { uploads } = result as {
      ok: true;
      uploads: { stickerId: string; key: string; url: string }[];
    };

    expect(uploads[0].key).toBe("u_user-abc/order-1/s1.webp");
  });

  it("passes correct price snapshot to orders insert", async () => {
    const admin = makeFakeAdmin();
    const presignUpload = makeFakePresign();

    await createDraft(
      { stickers: [stickerA, stickerB], copies: 3 },
      {
        admin: admin as unknown as CreateDraftDeps["admin"],
        presignUpload,
        userId: null,
        newId: makeIdGen("s1", "s2"),
      },
    );

    const breakdown = computePrice(2, 3);
    const orderPayload = admin._insertedOrderPayloads[0] as Record<string, unknown>;

    expect(orderPayload["price_sheets"]).toBe(breakdown.totalSheets);
    expect(orderPayload["price_rate"]).toBe(breakdown.perSheetRate);
    expect(orderPayload["price_setup"]).toBe(breakdown.setupFee);
    expect(orderPayload["price_currency"]).toBe(breakdown.currency);
    expect(orderPayload["price_total"]).toBe(breakdown.total);
    expect(orderPayload["copies"]).toBe(3);
  });

  it("inserts correct sticker rows with sort_index and storage_key", async () => {
    const admin = makeFakeAdmin();
    const presignUpload = makeFakePresign();

    await createDraft(
      { stickers: [stickerA, stickerB], copies: 1 },
      {
        admin: admin as unknown as CreateDraftDeps["admin"],
        presignUpload,
        userId: null,
        newId: makeIdGen("s1", "s2"),
      },
    );

    const rows = admin._insertedStickerRows[0] as {
      id: string;
      order_id: string;
      storage_key: string;
      original_filename: string;
      sort_index: number;
    }[];

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "s1",
      order_id: "order-1",
      storage_key: "g_gt_1/order-1/s1.webp",
      original_filename: "a.webp",
      sort_index: 0,
    });
    expect(rows[1]).toMatchObject({
      id: "s2",
      order_id: "order-1",
      storage_key: "g_gt_1/order-1/s2.webp",
      original_filename: "b.webp",
      sort_index: 1,
    });
  });

  it("returns validation failure and does NOT call admin.insert for invalid input", async () => {
    const admin = makeFakeAdmin();
    const presignUpload = makeFakePresign();
    const fromSpy = vi.spyOn(admin, "from");

    const result = await createDraft(
      { stickers: [], copies: 1 }, // 0 stickers → invalid
      {
        admin: admin as unknown as CreateDraftDeps["admin"],
        presignUpload,
        userId: null,
      },
    );

    expect(result).toMatchObject({ ok: false });
    const r = result as { ok: false; errors?: Record<string, string> };
    expect(r.errors).toBeDefined();
    expect(fromSpy).not.toHaveBeenCalled();
    expect(presignUpload).not.toHaveBeenCalled();
  });

  it("returns db_error and skips order_stickers insert when orders insert fails", async () => {
    const admin = makeFakeAdmin({
      orderResult: { data: null, error: { message: "db fail" } },
    });

    const result = await createDraft(
      { stickers: [stickerA], copies: 1 },
      {
        admin: admin as unknown as CreateDraftDeps["admin"],
        presignUpload: makeFakePresign(),
        userId: null,
        newId: makeIdGen("s1"),
      },
    );

    expect(result).toEqual({ ok: false, message: "db_error" });
    // order_stickers was never inserted
    expect(admin._insertedStickerRows).toHaveLength(0);
  });

  it("returns db_error when order_stickers insert fails", async () => {
    const admin = makeFakeAdmin({
      stickersResult: { error: { message: "stickers db fail" } },
    });

    const result = await createDraft(
      { stickers: [stickerA], copies: 1 },
      {
        admin: admin as unknown as CreateDraftDeps["admin"],
        presignUpload: makeFakePresign(),
        userId: null,
        newId: makeIdGen("s1"),
      },
    );

    expect(result).toEqual({ ok: false, message: "db_error" });
  });

  it("calls presignUpload with contentType image/webp for each sticker", async () => {
    const admin = makeFakeAdmin();
    const presignUpload = makeFakePresign();

    await createDraft(
      { stickers: [stickerA, stickerB], copies: 1 },
      {
        admin: admin as unknown as CreateDraftDeps["admin"],
        presignUpload,
        userId: null,
        newId: makeIdGen("s1", "s2"),
      },
    );

    expect(presignUpload).toHaveBeenCalledTimes(2);
    expect(presignUpload).toHaveBeenCalledWith("g_gt_1/order-1/s1.webp", {
      contentType: "image/webp",
    });
    expect(presignUpload).toHaveBeenCalledWith("g_gt_1/order-1/s2.webp", {
      contentType: "image/webp",
    });
  });
});
