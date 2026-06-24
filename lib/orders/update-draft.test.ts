vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { updateDraft } from "@/lib/orders/update-draft";
import type { UpdateDraftDeps } from "@/lib/orders/update-draft";
import { computePrice } from "@/lib/stickers/pricing";

const META = { filename: "n.webp", bytes: 2048, contentType: "image/webp", width: 64, height: 64 };

function makeFakeAdmin({
  order = { id: "o1", confirmed_at: null, guest_token: "gt1" } as { id: string; confirmed_at: string | null; guest_token: string } | null,
  existing = [
    { id: "s1", storage_key: "u_user-1/o1/s1.webp", sort_index: 0 },
    { id: "s2", storage_key: "u_user-1/o1/s2.webp", sort_index: 1 },
  ],
} = {}) {
  const calls = { deletedIn: [] as string[][], inserted: [] as unknown[], updated: [] as unknown[] };
  const admin = {
    _calls: calls,
    from(table: string) {
      if (table === "orders") {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() { return Promise.resolve({ data: order, error: null }); },
          update(payload: unknown) {
            calls.updated.push(payload);
            return { eq() { return Promise.resolve({ error: null }); } };
          },
        };
      }
      if (table === "order_stickers") {
        return {
          select() { return { eq() { return Promise.resolve({ data: existing, error: null }); } }; },
          delete() { return { in(_c: string, ids: string[]) { calls.deletedIn.push(ids); return Promise.resolve({ error: null }); } }; },
          insert(rows: unknown) { calls.inserted.push(rows); return Promise.resolve({ error: null }); },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return admin;
}

function makeDeps(over: Partial<UpdateDraftDeps> = {}): UpdateDraftDeps {
  let i = 0;
  return {
    admin: makeFakeAdmin() as unknown as UpdateDraftDeps["admin"],
    presignUpload: vi.fn(async (key: string) => `https://signed/${key}`),
    deleteObjects: vi.fn(async () => {}),
    userId: "user-1",
    newId: () => `new-${++i}`,
    ...over,
  };
}

describe("updateDraft", () => {
  it("removes dropped stickers (S3 + DB) and re-snapshots price", async () => {
    const admin = makeFakeAdmin();
    const deps = makeDeps({ admin: admin as unknown as UpdateDraftDeps["admin"] });
    // keep s1, drop s2, add one new → 2 stickers
    const result = await updateDraft(
      { orderId: "o1", keepStickerIds: ["s1"], addStickers: [META], copies: 3 },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(deps.deleteObjects).toHaveBeenCalledWith(["u_user-1/o1/s2.webp"]);
    expect(admin._calls.deletedIn).toEqual([["s2"]]);
    const breakdown = computePrice(2, 3); // 1 kept + 1 added
    expect(admin._calls.updated[0]).toMatchObject({ copies: 3, price_total: breakdown.total });
    const r = result as { ok: true; uploads: { key: string }[] };
    expect(r.uploads).toHaveLength(1);
    expect(r.uploads[0].key).toBe("u_user-1/o1/new-1.webp");
    expect((result as { guestToken?: string }).guestToken).toBe("gt1");
  });

  it("appends new stickers after the current max sort_index", async () => {
    const admin = makeFakeAdmin();
    const deps = makeDeps({ admin: admin as unknown as UpdateDraftDeps["admin"] });
    await updateDraft({ orderId: "o1", keepStickerIds: ["s1", "s2"], addStickers: [META], copies: 1 }, deps);
    const rows = admin._calls.inserted[0] as { sort_index: number }[];
    expect(rows[0].sort_index).toBe(2);
  });

  it("does not delete when nothing was removed", async () => {
    const deps = makeDeps();
    await updateDraft({ orderId: "o1", keepStickerIds: ["s1", "s2"], addStickers: [META], copies: 1 }, deps);
    expect(deps.deleteObjects).not.toHaveBeenCalled();
  });

  it("returns not_found when the order is not the user's draft", async () => {
    const admin = makeFakeAdmin({ order: null });
    const deps = makeDeps({ admin: admin as unknown as UpdateDraftDeps["admin"] });
    const r = await updateDraft({ orderId: "o1", keepStickerIds: ["s1"], addStickers: [], copies: 1 }, deps);
    expect(r).toEqual({ ok: false, message: "not_found" });
  });

  it("returns already_finalized for a confirmed order", async () => {
    const admin = makeFakeAdmin({ order: { id: "o1", confirmed_at: "2026-01-01T00:00:00Z", guest_token: "gt1" } });
    const deps = makeDeps({ admin: admin as unknown as UpdateDraftDeps["admin"] });
    const r = await updateDraft({ orderId: "o1", keepStickerIds: ["s1"], addStickers: [], copies: 1 }, deps);
    expect(r).toEqual({ ok: false, message: "already_finalized" });
  });

  it("returns validation errors for an empty final set", async () => {
    const deps = makeDeps();
    const r = await updateDraft({ orderId: "o1", keepStickerIds: [], addStickers: [], copies: 1 }, deps);
    expect(r).toMatchObject({ ok: false });
    expect((r as { errors?: unknown }).errors).toBeDefined();
  });
});
