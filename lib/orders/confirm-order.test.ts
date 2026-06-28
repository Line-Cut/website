// Mock "server-only" so the module can be imported in tests
vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { confirmOrder } from "@/lib/orders/confirm-order";
import type { ConfirmOrderDeps } from "@/lib/orders/confirm-order";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_PICKUP_DELIVERY = {
  method: "pickup",
  firstName: "Dana",
  lastName: "Cohen",
  phone: "+972501234567",
  email: "dana@example.com",
};

const VALID_PICKUP_WITH_NOTES = {
  ...VALID_PICKUP_DELIVERY,
  notes: "Please ring the bell",
};

const VALID_SHIPPING_DELIVERY = {
  method: "shipping",
  firstName: "Dana",
  lastName: "Cohen",
  phone: "+972501234567",
  email: "dana@example.com",
  addressLine1: "123 Herzl St",
  city: "Tel Aviv",
  postalCode: "61000",
  country: "Israel",
};

const VALID_SHIPPING_WITH_NOTES = {
  ...VALID_SHIPPING_DELIVERY,
  notes: "Leave at door",
};

// Friendly prefix produced for the pickup/shipping fixtures above.
const FRIENDLY_PREFIX = "order-uuid-Dana-Cohen-972501234567";

const DRAFT_ORDER = {
  id: "order-uuid",
  guest_token: "gt_abc",
  confirmed_at: null,
  payment_status: "awaiting_payment",
  price_total: 1200,
  price_currency: "ILS",
  price_sheets: 2,
  price_rate: 500,
  price_setup: 200,
  copies: 2,
};

const PAID_ORDER = {
  ...DRAFT_ORDER,
  payment_status: "paid",
  confirmed_at: "2024-01-01T00:00:00.000Z",
};

const STICKERS = [
  { id: "s1", storage_key: "g_gt_abc/order-uuid/s1.webp" },
  { id: "s2", storage_key: "g_gt_abc/order-uuid/s2.webp" },
];

// ---------------------------------------------------------------------------
// Fake admin builder
// ---------------------------------------------------------------------------

type FakeOrder = typeof DRAFT_ORDER | typeof PAID_ORDER | null;
type FakeStickers = { id: string; storage_key: string }[];

function makeFakeAdmin({
  order = DRAFT_ORDER as FakeOrder,
  stickers = STICKERS as FakeStickers,
  updateError = null as { message: string } | null,
  stickerUpdateError = null as { message: string } | null,
} = {}) {
  const updates: { payload: unknown; filter: Record<string, unknown> }[] = [];
  const stickerUpdates: { payload: unknown; filter: Record<string, unknown> }[] =
    [];
  const queryFilters: Record<string, unknown>[] = [];

  const admin = {
    _updates: updates,
    _stickerUpdates: stickerUpdates,
    _queryFilters: queryFilters,
    from(table: string) {
      if (table === "orders") {
        const filters: Record<string, unknown> = {};
        const chain = {
          select(_cols: string) {
            return this;
          },
          eq(col: string, val: unknown) {
            filters[col] = val;
            return this;
          },
          maybeSingle() {
            queryFilters.push({ ...filters });
            return Promise.resolve({ data: order, error: null });
          },
          update(payload: unknown) {
            const updateFilters: Record<string, unknown> = {};
            return {
              eq(col: string, val: unknown) {
                updateFilters[col] = val;
                updates.push({ payload, filter: updateFilters });
                return Promise.resolve({ error: updateError });
              },
            };
          },
        };
        return chain;
      }
      if (table === "order_stickers") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, _val: unknown) {
                return Promise.resolve({ data: stickers, error: null });
              },
            };
          },
          update(payload: unknown) {
            const updateFilters: Record<string, unknown> = {};
            return {
              eq(col: string, val: unknown) {
                updateFilters[col] = val;
                stickerUpdates.push({ payload, filter: updateFilters });
                return Promise.resolve({ error: stickerUpdateError });
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return admin;
}

// ---------------------------------------------------------------------------
// Default deps factory
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<ConfirmOrderDeps> = {}): ConfirmOrderDeps {
  const defaultDeps: ConfirmOrderDeps = {
    admin: makeFakeAdmin() as unknown as ConfirmOrderDeps["admin"],
    objectExists: vi.fn(async () => true),
    copyObject: vi.fn(async () => {}),
    putObject: vi.fn(async () => {}),
    deletePrefix: vi.fn(async () => {}),
    buildMetadataPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    paymentProvider: {
      createCheckout: vi.fn(async () => ({
        status: "paid" as const,
        reference: "MOCK-ref",
      })),
    },
    finalizePaidOrder: vi.fn(async () => ({ ok: true as const, alreadyPaid: false })),
    redirectUrlFor: (gt, l) => `https://s/${l}/stickers/track/${gt}`,
    ipnUrl: "https://s/api/payments/icredit/ipn",
    now: () => "2024-06-01T12:00:00.000Z",
  };
  return { ...defaultDeps, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("confirmOrder", () => {
  it("returns ok:false with errors for invalid delivery (missing required fields)", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: { method: "pickup" }, // missing names, email, phone
        locale: "he",
      },
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toBeDefined();
    }
    expect(fakeAdmin._updates).toHaveLength(0);
    expect(deps.copyObject).not.toHaveBeenCalled();
    expect(deps.finalizePaidOrder).not.toHaveBeenCalled();
  });

  it("returns ok:false not_found when order is not found (admin returns null)", async () => {
    const fakeAdmin = makeFakeAdmin({ order: null });
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
        locale: "he",
      },
      deps,
    );

    expect(result).toEqual({ ok: false, message: "not_found" });
  });

  it("returns ok:true (idempotent) when order is already paid; no re-key, no payment, no finalize", async () => {
    const fakeAdmin = makeFakeAdmin({ order: PAID_ORDER });
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
        locale: "he",
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      orderId: "order-uuid",
      guestToken: "gt_abc",
    });
    expect(deps.paymentProvider.createCheckout).not.toHaveBeenCalled();
    expect(deps.copyObject).not.toHaveBeenCalled();
    expect(deps.finalizePaidOrder).not.toHaveBeenCalled();
  });

  it("returns ok:false uploads_incomplete when an S3 object is missing; no re-key, no payment", async () => {
    const fakeAdmin = makeFakeAdmin();
    const objectExists = vi
      .fn()
      .mockResolvedValueOnce(true) // first sticker exists
      .mockResolvedValueOnce(false); // second sticker missing
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
      objectExists,
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
        locale: "he",
      },
      deps,
    );

    expect(result).toEqual({ ok: false, message: "uploads_incomplete" });
    expect(deps.copyObject).not.toHaveBeenCalled();
    expect(deps.paymentProvider.createCheckout).not.toHaveBeenCalled();
    expect(fakeAdmin._updates).toHaveLength(0);
  });

  it("happy path (pickup, paid): re-keys files, writes metadata, updates contact + storage_prefix; calls finalizePaidOrder", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
        locale: "he",
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      orderId: "order-uuid",
      guestToken: "gt_abc",
    });

    // Re-key: each sticker copied to its friendly key + storage_key updated
    expect(deps.copyObject).toHaveBeenCalledTimes(2);
    expect(deps.copyObject).toHaveBeenCalledWith(
      "g_gt_abc/order-uuid/s1.webp",
      `${FRIENDLY_PREFIX}/s1.webp`,
    );
    expect(fakeAdmin._stickerUpdates).toHaveLength(2);
    expect(fakeAdmin._stickerUpdates[0].payload).toEqual({
      storage_key: `${FRIENDLY_PREFIX}/s1.webp`,
    });

    // metadata.pdf written + temp prefix removed
    expect(deps.buildMetadataPdf).toHaveBeenCalledTimes(1);
    expect(deps.putObject).toHaveBeenCalledWith(
      `${FRIENDLY_PREFIX}/metadata.pdf`,
      expect.any(Uint8Array),
      { contentType: "application/pdf" },
    );
    expect(deps.deletePrefix).toHaveBeenCalledWith("g_gt_abc/order-uuid/");

    // One contact + storage_prefix update (no payment fields — those go to finalizePaidOrder)
    expect(fakeAdmin._updates).toHaveLength(1);
    const { payload, filter } = fakeAdmin._updates[0];
    const p = payload as Record<string, unknown>;
    expect(filter).toEqual({ id: "order-uuid" });
    expect(p.contact_name).toBe("Dana Cohen");
    expect(p.contact_first_name).toBe("Dana");
    expect(p.contact_last_name).toBe("Cohen");
    expect(p.contact_email).toBe("dana@example.com");
    expect(p.contact_phone).toBe("+972501234567");
    expect(p.storage_prefix).toBe(FRIENDLY_PREFIX);
    expect(p.delivery_method).toBe("pickup");
    // Payment fields must NOT be in this update
    expect(p.confirmed_at).toBeUndefined();
    expect(p.payment_status).toBeUndefined();
    expect(p.paid_at).toBeUndefined();
    expect(p.payment_reference).toBeUndefined();

    // finalizePaidOrder called for the mock paid path
    expect(deps.finalizePaidOrder).toHaveBeenCalledTimes(1);
    expect(deps.finalizePaidOrder).toHaveBeenCalledWith({
      orderId: "order-uuid",
      paidAtISO: "2024-06-01T12:00:00.000Z",
      provider: "mock",
      saleId: "MOCK-ref",
      reference: "MOCK-ref",
      receiptDocumentUrl: null,
      receiptDocumentNumber: null,
    });
  });

  it("paid (mock) branch: calls finalizePaidOrder with correct args, returns ok:true without redirectUrl", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
      paymentProvider: {
        createCheckout: vi.fn(async () => ({
          status: "paid" as const,
          reference: "MOCK-order-uuid",
        })),
      },
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
        locale: "he",
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      orderId: "order-uuid",
      guestToken: "gt_abc",
    });
    expect((result as { redirectUrl?: string }).redirectUrl).toBeUndefined();

    expect(deps.finalizePaidOrder).toHaveBeenCalledTimes(1);
    expect(deps.finalizePaidOrder).toHaveBeenCalledWith({
      orderId: "order-uuid",
      paidAtISO: "2024-06-01T12:00:00.000Z",
      provider: "mock",
      saleId: "MOCK-order-uuid",
      reference: "MOCK-order-uuid",
      receiptDocumentUrl: null,
      receiptDocumentNumber: null,
    });
  });

  it("redirect branch: returns redirectUrl, does NOT call finalizePaidOrder, updates payment_provider + payment_reference", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
      paymentProvider: {
        createCheckout: vi.fn(async () => ({
          status: "redirect" as const,
          url: "https://icredit.example/pay/123",
          reference: "REF-abc",
        })),
      },
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
        locale: "he",
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      orderId: "order-uuid",
      guestToken: "gt_abc",
      redirectUrl: "https://icredit.example/pay/123",
    });

    // finalizePaidOrder NOT called on redirect path
    expect(deps.finalizePaidOrder).not.toHaveBeenCalled();

    // Two updates: contact fields update + payment provider/reference update
    expect(fakeAdmin._updates).toHaveLength(2);
    const contactPayload = fakeAdmin._updates[0].payload as Record<string, unknown>;
    expect(contactPayload.contact_name).toBe("Dana Cohen");
    expect(contactPayload.storage_prefix).toBe(FRIENDLY_PREFIX);
    expect(contactPayload.payment_provider).toBeUndefined();

    const providerPayload = fakeAdmin._updates[1].payload as Record<string, unknown>;
    expect(providerPayload.payment_provider).toBe("icredit");
    expect(providerPayload.payment_reference).toBe("REF-abc");
  });

  it("createCheckout receives locale, redirectUrlFor result, and ipnUrl", async () => {
    const deps = makeDeps();
    await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
        locale: "he",
      },
      deps,
    );
    expect(deps.paymentProvider.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "he",
        redirectUrl: "https://s/he/stickers/track/gt_abc",
        ipnUrl: "https://s/api/payments/icredit/ipn",
      }),
    );
  });

  it("returns ok:false payment_failed when the provider declines; contact update still happened, no finalizePaidOrder", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
      paymentProvider: {
        createCheckout: vi.fn(async () => ({
          status: "failed" as const,
          reason: "insufficient funds",
        })),
      },
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
        locale: "he",
      },
      deps,
    );

    expect(result).toEqual({ ok: false, message: "payment_failed" });
    // Contact update happened (no rollback — order is a draft; recoverable)
    expect(fakeAdmin._updates).toHaveLength(1);
    expect(deps.finalizePaidOrder).not.toHaveBeenCalled();
  });

  it("returns ok:false db_error when the order update fails; no finalizePaidOrder", async () => {
    const fakeAdmin = makeFakeAdmin({
      updateError: { message: "constraint violation" },
    });
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
        locale: "he",
      },
      deps,
    );

    expect(result).toEqual({ ok: false, message: "db_error" });
    expect(deps.finalizePaidOrder).not.toHaveBeenCalled();
  });

  it("shipping path: update includes ship_* fields", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_SHIPPING_DELIVERY,
        locale: "he",
      },
      deps,
    );

    const { payload } = fakeAdmin._updates[0];
    const p = payload as Record<string, unknown>;

    expect(p.delivery_method).toBe("shipping");
    expect(p.ship_address_line1).toBe("123 Herzl St");
    expect(p.ship_city).toBe("Tel Aviv");
    expect(p.ship_postal_code).toBe("61000");
    expect(p.ship_country).toBe("Israel");
  });

  it("pickup path: ship_* fields are null", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
        locale: "he",
      },
      deps,
    );

    const { payload } = fakeAdmin._updates[0];
    const p = payload as Record<string, unknown>;

    expect(p.ship_address_line1).toBeNull();
    expect(p.ship_city).toBeNull();
    expect(p.ship_postal_code).toBeNull();
  });

  it("shipping with notes: update payload includes ship_notes with the customer note", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_SHIPPING_WITH_NOTES,
        locale: "he",
      },
      deps,
    );

    expect(result.ok).toBe(true);
    const { payload } = fakeAdmin._updates[0];
    const p = payload as Record<string, unknown>;
    expect(p.ship_notes).toBe("Leave at door");
  });

  it("pickup with notes: update payload includes ship_notes with the customer note", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_WITH_NOTES,
        locale: "he",
      },
      deps,
    );

    expect(result.ok).toBe(true);
    const { payload } = fakeAdmin._updates[0];
    const p = payload as Record<string, unknown>;
    expect(p.ship_notes).toBe("Please ring the bell");
  });

  it("delivery without notes: update payload sets ship_notes to null", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
        locale: "he",
      },
      deps,
    );

    const { payload } = fakeAdmin._updates[0];
    const p = payload as Record<string, unknown>;
    expect(p.ship_notes).toBeNull();
  });
});
