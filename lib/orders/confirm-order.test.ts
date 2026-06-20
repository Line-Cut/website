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
  fullName: "Dana Cohen",
  phone: "+972501234567",
  email: "dana@example.com",
};

const VALID_SHIPPING_DELIVERY = {
  method: "shipping",
  fullName: "Dana Cohen",
  phone: "+972501234567",
  email: "dana@example.com",
  addressLine1: "123 Herzl St",
  city: "Tel Aviv",
  postalCode: "61000",
  country: "Israel",
};

const DRAFT_ORDER = {
  id: "order-uuid",
  guest_token: "gt_abc",
  confirmed_at: null,
  price_total: 1200,
  price_currency: "ILS",
  price_sheets: 2,
  price_rate: 500,
  price_setup: 200,
  copies: 2,
};

const CONFIRMED_ORDER = {
  ...DRAFT_ORDER,
  confirmed_at: "2024-01-01T00:00:00.000Z",
};

const STICKERS = [
  { storage_key: "g_gt_abc/order-uuid/s1.webp" },
  { storage_key: "g_gt_abc/order-uuid/s2.webp" },
];

// ---------------------------------------------------------------------------
// Fake admin builder
// ---------------------------------------------------------------------------

type FakeOrder = typeof DRAFT_ORDER | typeof CONFIRMED_ORDER | null;
type FakeStickers = { storage_key: string }[];

function makeFakeAdmin({
  order = DRAFT_ORDER as FakeOrder,
  stickers = STICKERS as FakeStickers,
  updateError = null as { message: string } | null,
} = {}) {
  const updates: { payload: unknown; filter: Record<string, unknown> }[] = [];
  const queryFilters: Record<string, unknown>[] = [];

  const admin = {
    _updates: updates,
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
    paymentProvider: {
      createCharge: vi.fn(async () => ({
        status: "awaiting_payment" as const,
      })),
    },
    sendOwnerEmail: vi.fn(async () => {}),
    ownerFilesUrlFor: (id) =>
      `https://linecut.example/he/admin/orders/${id}/files`,
    now: () => "2024-06-01T12:00:00.000Z",
  };
  return { ...defaultDeps, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("confirmOrder", () => {
  it("returns ok:false with errors for invalid delivery (missing required fields)", async () => {
    const deps = makeDeps();
    const fakeAdmin = makeFakeAdmin();
    deps.admin = fakeAdmin as unknown as ConfirmOrderDeps["admin"];

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: { method: "pickup" }, // missing fullName, email, phone
      },
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toBeDefined();
    }
    // DB should NOT have been updated
    expect(fakeAdmin._updates).toHaveLength(0);
    expect(deps.sendOwnerEmail).not.toHaveBeenCalled();
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
      },
      deps,
    );

    expect(result).toEqual({ ok: false, message: "not_found" });
  });

  it("returns ok:true (idempotent) when order is already confirmed; does NOT call payment or email", async () => {
    const fakeAdmin = makeFakeAdmin({ order: CONFIRMED_ORDER });
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      orderId: "order-uuid",
      guestToken: "gt_abc",
    });
    expect(deps.paymentProvider.createCharge).not.toHaveBeenCalled();
    expect(deps.sendOwnerEmail).not.toHaveBeenCalled();
  });

  it("returns ok:false uploads_incomplete when an S3 object is missing; no payment, no update", async () => {
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
      },
      deps,
    );

    expect(result).toEqual({ ok: false, message: "uploads_incomplete" });
    expect(deps.paymentProvider.createCharge).not.toHaveBeenCalled();
    expect(fakeAdmin._updates).toHaveLength(0);
  });

  it("happy path (pickup): sets confirmed_at, contact fields, payment_status=awaiting_payment; emails owner once", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      orderId: "order-uuid",
      guestToken: "gt_abc",
    });

    // One update call
    expect(fakeAdmin._updates).toHaveLength(1);
    const { payload, filter } = fakeAdmin._updates[0];
    const p = payload as Record<string, unknown>;

    expect(filter).toEqual({ id: "order-uuid" });
    expect(p.confirmed_at).toBe("2024-06-01T12:00:00.000Z");
    expect(p.contact_name).toBe("Dana Cohen");
    expect(p.contact_email).toBe("dana@example.com");
    expect(p.contact_phone).toBe("+972501234567");
    expect(p.payment_status).toBe("awaiting_payment");
    expect(p.delivery_method).toBe("pickup");

    // Owner email sent once
    expect(deps.sendOwnerEmail).toHaveBeenCalledTimes(1);
  });

  it("does not fail (ok:true) when sendOwnerEmail throws", async () => {
    const deps = makeDeps({
      sendOwnerEmail: vi.fn(async () => {
        throw new Error("Resend down");
      }),
    });

    const result = await confirmOrder(
      {
        orderId: "order-uuid",
        guestToken: "gt_abc",
        delivery: VALID_PICKUP_DELIVERY,
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      orderId: "order-uuid",
      guestToken: "gt_abc",
    });
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
      },
      deps,
    );

    const { payload } = fakeAdmin._updates[0];
    const p = payload as Record<string, unknown>;

    expect(p.ship_address_line1).toBeNull();
    expect(p.ship_city).toBeNull();
    expect(p.ship_postal_code).toBeNull();
  });

  it("returns ok:false payment_failed when the provider declines; no DB update, no email", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as ConfirmOrderDeps["admin"],
      paymentProvider: {
        createCharge: vi.fn(async () => ({
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
      },
      deps,
    );

    expect(result).toEqual({ ok: false, message: "payment_failed" });
    expect(fakeAdmin._updates).toHaveLength(0);
    expect(deps.sendOwnerEmail).not.toHaveBeenCalled();
  });

  it("returns ok:false db_error when the order update fails; no email", async () => {
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
      },
      deps,
    );

    expect(result).toEqual({ ok: false, message: "db_error" });
    expect(deps.sendOwnerEmail).not.toHaveBeenCalled();
  });
});
