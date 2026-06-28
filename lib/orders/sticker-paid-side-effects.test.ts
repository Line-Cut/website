// Mock "server-only" so the module can be imported in tests
vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { runStickerPaidSideEffects } from "@/lib/orders/sticker-paid-side-effects";
import type { StickerPaidSideEffectsDeps } from "@/lib/orders/sticker-paid-side-effects";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STICKER_ORDER_ROW = {
  id: "order-abc-123",
  order_kind: "sticker",
  storage_prefix: "abc123/order-abc-123-dana-cohen-0501234567/",
  price_total: 1500,
  price_currency: "ILS",
  price_rate: 50,
  price_sheets: 20,
  price_setup: 500,
  copies: 3,
  payment_reference: "REF-XYZ",
  paid_at: "2026-06-29T10:00:00.000Z",
  contact_name: "Dana Cohen",
  contact_first_name: "Dana",
  contact_last_name: "Cohen",
  contact_email: "dana@example.com",
  contact_phone: "+972501234567",
  delivery_method: "pickup",
  ship_address_line1: null,
  ship_address_line2: null,
  ship_city: null,
  ship_postal_code: null,
  ship_country: null,
  ship_notes: null,
};

function makeDeps(
  overrides: Partial<StickerPaidSideEffectsDeps> = {},
): StickerPaidSideEffectsDeps {
  return {
    markOrderPaid: vi.fn().mockResolvedValue({ ok: true }),
    loadStickerCount: vi.fn().mockResolvedValue(5),
    sendOwnerEmail: vi.fn().mockResolvedValue(undefined),
    ownerFilesUrlFor: (id: string) => `https://owner.example.com/files/${id}`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runStickerPaidSideEffects", () => {
  it("calls markOrderPaid with storage_prefix and receipt, and sendOwnerEmail once", async () => {
    const deps = makeDeps();

    await runStickerPaidSideEffects(STICKER_ORDER_ROW, deps);

    // markOrderPaid assertions
    expect(deps.markOrderPaid).toHaveBeenCalledOnce();
    expect(deps.markOrderPaid).toHaveBeenCalledWith({
      orderId: "order-abc-123",
      storagePrefix: STICKER_ORDER_ROW.storage_prefix,
      receipt: {
        orderId: "order-abc-123",
        amount: 1500,
        currency: "ILS",
        reference: "REF-XYZ",
        paidAtISO: "2026-06-29T10:00:00.000Z",
      },
    });

    // sendOwnerEmail assertions
    expect(deps.sendOwnerEmail).toHaveBeenCalledOnce();
    const emailArg = (deps.sendOwnerEmail as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { subject: string; text: string; replyTo: string };
    expect(emailArg.subject).toContain("sticker order");
    expect(emailArg.replyTo).toBe("dana@example.com");
    expect(emailArg.text.length).toBeGreaterThan(0);
    expect(emailArg.text).toContain("Dana Cohen");
  });

  it("does not propagate a markOrderPaid throw, and still calls sendOwnerEmail", async () => {
    const deps = makeDeps({
      markOrderPaid: vi.fn().mockRejectedValue(new Error("storage down")),
    });

    // Must resolve — not throw
    await expect(
      runStickerPaidSideEffects(STICKER_ORDER_ROW, deps),
    ).resolves.toBeUndefined();

    // Email is still attempted after markOrderPaid failure
    expect(deps.sendOwnerEmail).toHaveBeenCalledOnce();
  });

  it("does not propagate a sendOwnerEmail throw", async () => {
    const deps = makeDeps({
      sendOwnerEmail: vi.fn().mockRejectedValue(new Error("smtp down")),
    });

    await expect(
      runStickerPaidSideEffects(STICKER_ORDER_ROW, deps),
    ).resolves.toBeUndefined();
  });
});
