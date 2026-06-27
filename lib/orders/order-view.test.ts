// Mock "server-only" so the module can be imported in tests
vi.mock("server-only", () => ({}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOrderByGuestToken, getOrderByToken } from "@/lib/orders/order-view";
import type { StickerOrderView } from "@/lib/orders/types";

// ---------------------------------------------------------------------------
// Fake admin client builder
// ---------------------------------------------------------------------------

/**
 * Builds a fake Supabase admin client that supports the chained query pattern
 * used in order-view.ts:
 *   .from("orders").select("*").eq(...).eq(...).not(...).single()
 *   .from("orders").select("*").eq(...).not(...).single()
 *   .from("order_stickers").select("order_id").eq("order_id", id)
 */
function makeFakeAdmin({
  orderResult = {
    data: null as unknown,
    error: null as { message: string } | null,
  },
  stickersResult = {
    data: [] as { order_id: string }[],
    error: null as { message: string } | null,
  },
}: {
  orderResult?: { data: unknown; error: { message: string } | null };
  stickersResult?: {
    data: { order_id: string }[];
    error: { message: string } | null;
  };
} = {}) {
  return {
    from(table: string) {
      if (table === "orders") {
        // Fluent builder for orders — supports any number of .eq() + .not() then .single()
        const builder = {
          select(_cols: string) {
            return this;
          },
          eq(_col: string, _val: unknown) {
            return this;
          },
          not(_col: string, _op: string, _val: unknown) {
            return this;
          },
          single() {
            return Promise.resolve(orderResult);
          },
        };
        return builder;
      }

      if (table === "order_stickers") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, _val: unknown) {
                return Promise.resolve(stickersResult);
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Mock createAdminSupabaseClient
// ---------------------------------------------------------------------------

// We capture the factory so individual tests can swap the fake admin.
let fakeAdmin: ReturnType<typeof makeFakeAdmin>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => fakeAdmin,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseOrderRow = {
  id: "order-abc",
  guest_token: "token-xyz",
  order_kind: "stickers",
  status: "received",
  payment_status: "awaiting_payment",
  confirmed_at: "2026-06-20T10:00:00.000Z",
  created_at: "2026-06-19T08:00:00.000Z",
  copies: 2,
  price_sheets: 4,
  price_rate: 1000,
  price_setup: 500,
  price_total: 4500,
  price_currency: "ILS",
  contact_name: "Test User",
  contact_phone: "0501234567",
  contact_email: "test@example.com",
  delivery_method: "pickup",
  ship_address_line1: null,
  ship_address_line2: null,
  ship_city: null,
  ship_postal_code: null,
  ship_country: null,
  ship_notes: null,
};

const stickersData = [
  { order_id: "order-abc" },
  { order_id: "order-abc" },
  { order_id: "order-abc" },
];

// ---------------------------------------------------------------------------
// Tests — getOrderByGuestToken
// ---------------------------------------------------------------------------

describe("getOrderByGuestToken", () => {
  beforeEach(() => {
    fakeAdmin = makeFakeAdmin({
      orderResult: { data: baseOrderRow, error: null },
      stickersResult: { data: stickersData, error: null },
    });
  });

  it("returns correct OrderView when row + stickers found", async () => {
    const result = (await getOrderByGuestToken("order-abc", "token-xyz", "en")) as StickerOrderView | null;

    expect(result).not.toBeNull();
    expect(result!.orderId).toBe("order-abc");
    expect(result!.guestToken).toBe("token-xyz");
    expect(result!.status).toBe("received");
    expect(result!.paymentStatus).toBe("awaiting_payment");
    expect(result!.createdAtISO).toBe("2026-06-20T10:00:00.000Z"); // confirmed_at wins
    expect(result!.copies).toBe(2);

    // Breakdown
    expect(result!.breakdown.totalSheets).toBe(4);
    expect(result!.breakdown.perSheetRate).toBe(1000);
    expect(result!.breakdown.setupFee).toBe(500);
    expect(result!.breakdown.sheetsSubtotal).toBe(4000); // 4500 - 500
    expect(result!.breakdown.total).toBe(4500);
    expect(result!.breakdown.currency).toBe("ILS");
    expect(result!.breakdown.uniqueCount).toBe(3); // from sticker count
    expect(result!.breakdown.copies).toBe(2);
    // perSheet and sheetsPerSet not stored in DB — should be 0
    expect(result!.breakdown.perSheet).toBe(0);
    expect(result!.breakdown.sheetsPerSet).toBe(0);

    // Delivery
    expect(result!.delivery.method).toBe("pickup");
    expect(result!.delivery.firstName).toBe("Test User");
    expect(result!.delivery.lastName).toBe("");
    expect(result!.delivery.phone).toBe("0501234567");
    expect(result!.delivery.email).toBe("test@example.com");
    expect(result!.delivery.addressLine1).toBeUndefined();
    expect(result!.delivery.city).toBeUndefined();
  });

  it("uses confirmed_at as createdAtISO when available", async () => {
    const result = (await getOrderByGuestToken("order-abc", "token-xyz", "en")) as StickerOrderView | null;
    expect(result!.createdAtISO).toBe(baseOrderRow.confirmed_at);
  });

  it("falls back to created_at when confirmed_at is null", async () => {
    fakeAdmin = makeFakeAdmin({
      orderResult: {
        data: { ...baseOrderRow, confirmed_at: null },
        error: null,
      },
      stickersResult: { data: stickersData, error: null },
    });
    const result = (await getOrderByGuestToken("order-abc", "token-xyz", "en")) as StickerOrderView | null;
    expect(result!.createdAtISO).toBe(baseOrderRow.created_at);
  });

  it("returns null when order not found", async () => {
    fakeAdmin = makeFakeAdmin({
      orderResult: { data: null, error: { message: "not found" } },
      stickersResult: { data: [], error: null },
    });
    const result = (await getOrderByGuestToken("order-abc", "token-xyz", "en")) as StickerOrderView | null;
    expect(result).toBeNull();
  });

  it("maps shipping address fields to delivery", async () => {
    fakeAdmin = makeFakeAdmin({
      orderResult: {
        data: {
          ...baseOrderRow,
          delivery_method: "shipping",
          ship_address_line1: "HaSadna 8",
          ship_address_line2: "Floor 2",
          ship_city: "Holon",
          ship_postal_code: "58100",
          ship_country: "Israel",
        },
        error: null,
      },
      stickersResult: { data: stickersData, error: null },
    });

    const result = (await getOrderByGuestToken("order-abc", "token-xyz", "en")) as StickerOrderView | null;
    expect(result!.delivery.method).toBe("shipping");
    expect(result!.delivery.addressLine1).toBe("HaSadna 8");
    expect(result!.delivery.addressLine2).toBe("Floor 2");
    expect(result!.delivery.city).toBe("Holon");
    expect(result!.delivery.postalCode).toBe("58100");
    expect(result!.delivery.country).toBe("Israel");
  });

  it("maps ship_notes to delivery.notes", async () => {
    fakeAdmin = makeFakeAdmin({
      orderResult: {
        data: {
          ...baseOrderRow,
          ship_notes: "Please ring the bell",
        },
        error: null,
      },
      stickersResult: { data: stickersData, error: null },
    });

    const result = (await getOrderByGuestToken("order-abc", "token-xyz", "en")) as StickerOrderView | null;
    expect(result!.delivery.notes).toBe("Please ring the bell");
  });

  it("maps null ship_notes to undefined delivery.notes", async () => {
    // baseOrderRow already has ship_notes: null
    const result = (await getOrderByGuestToken("order-abc", "token-xyz", "en")) as StickerOrderView | null;
    expect(result!.delivery.notes).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — getOrderByToken
// ---------------------------------------------------------------------------

describe("getOrderByToken", () => {
  beforeEach(() => {
    fakeAdmin = makeFakeAdmin({
      orderResult: { data: baseOrderRow, error: null },
      stickersResult: { data: stickersData, error: null },
    });
  });

  it("returns correct OrderView when token matches", async () => {
    const result = (await getOrderByToken("token-xyz", "en")) as StickerOrderView | null;

    expect(result).not.toBeNull();
    expect(result!.orderId).toBe("order-abc");
    expect(result!.guestToken).toBe("token-xyz");
    expect(result!.breakdown.uniqueCount).toBe(3);
  });

  it("returns null when order not found", async () => {
    fakeAdmin = makeFakeAdmin({
      orderResult: { data: null, error: { message: "not found" } },
      stickersResult: { data: [], error: null },
    });
    const result = (await getOrderByToken("bad-token", "en")) as StickerOrderView | null;
    expect(result).toBeNull();
  });
});
