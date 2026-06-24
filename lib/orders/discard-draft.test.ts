vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { discardDraft } from "@/lib/orders/discard-draft";
import type { DiscardDraftDeps } from "@/lib/orders/discard-draft";

function makeAdmin(order: { id: string; confirmed_at: string | null } | null) {
  const deleted: string[] = [];
  return {
    _deleted: deleted,
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: order, error: null }); },
        delete() { return { eq(_c: string, id: string) { deleted.push(id); return Promise.resolve({ error: null }); } }; },
      };
    },
  };
}

describe("discardDraft", () => {
  it("deletes the S3 prefix and the order row for the user's draft", async () => {
    const admin = makeAdmin({ id: "o1", confirmed_at: null });
    const deletePrefix = vi.fn(async () => {});
    const r = await discardDraft("o1", { admin: admin as unknown as DiscardDraftDeps["admin"], deletePrefix, userId: "u1" });
    expect(r).toEqual({ ok: true });
    expect(deletePrefix).toHaveBeenCalledWith("u_u1/o1/");
    expect(admin._deleted).toEqual(["o1"]);
  });

  it("is idempotent when the draft is already gone", async () => {
    const admin = makeAdmin(null);
    const deletePrefix = vi.fn(async () => {});
    const r = await discardDraft("o1", { admin: admin as unknown as DiscardDraftDeps["admin"], deletePrefix, userId: "u1" });
    expect(r).toEqual({ ok: true });
    expect(deletePrefix).not.toHaveBeenCalled();
  });

  it("refuses to discard a confirmed order", async () => {
    const admin = makeAdmin({ id: "o1", confirmed_at: "2026-01-01T00:00:00Z" });
    const r = await discardDraft("o1", { admin: admin as unknown as DiscardDraftDeps["admin"], deletePrefix: vi.fn(async () => {}), userId: "u1" });
    expect(r).toEqual({ ok: false, message: "already_finalized" });
  });
});
