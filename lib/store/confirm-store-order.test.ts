vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { confirmStoreOrder } from "@/lib/store/confirm-store-order";
import type { ConfirmStoreOrderDeps } from "@/lib/store/confirm-store-order";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_PRODUCT_ROW = {
  id: "p1",
  slug: "sticker-p1",
  status: "active",
  title_he: "מדבקה",
  title_en: "Sticker",
  description_he: null,
  description_en: null,
  price: 1500,
  currency: "ILS",
  image_url: null,
  images: [],
  options: [],
  sort_index: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const INPUT = {
  clientRequestId: "req-123",
  locale: "he" as const,
  delivery: {
    method: "pickup",
    firstName: "Dana",
    lastName: "Cohen",
    phone: "+972501234567",
    email: "dana@example.com",
  },
  items: [{ productId: "p1", quantity: 1 }],
};

// ---------------------------------------------------------------------------
// Fake admin builder
// ---------------------------------------------------------------------------

function makeFakeAdmin({
  existingOrder = null as null | Record<string, unknown>,
  existingItems = [] as Record<string, unknown>[],
  productRows = [FAKE_PRODUCT_ROW] as Record<string, unknown>[],
  insertOrderRow = { id: "order-id", guest_token: "tok_abc" } as {
    id: string;
    guest_token: string;
  },
  insertOrderError = null as { code?: string; message?: string } | null,
  insertItemsError = null as { message?: string } | null,
} = {}) {
  const deleted: string[] = [];
  const orderUpdates: Record<string, unknown>[] = [];

  const admin = {
    _deleted: deleted,
    _orderUpdates: orderUpdates,
    from(table: string) {
      if (table === "products") {
        return {
          select(_cols: string) {
            return {
              in(_col: string, _ids: string[]) {
                return {
                  eq(_col2: string, _val: unknown) {
                    return Promise.resolve({ data: productRows, error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "orders") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, _val: unknown) {
                return {
                  maybeSingle() {
                    return Promise.resolve({ data: existingOrder, error: null });
                  },
                };
              },
            };
          },
          insert(_payload: unknown) {
            return {
              select(_cols: string) {
                return {
                  single() {
                    if (insertOrderError) {
                      return Promise.resolve({ data: null, error: insertOrderError });
                    }
                    return Promise.resolve({ data: insertOrderRow, error: null });
                  },
                };
              },
            };
          },
          update(payload: unknown) {
            return {
              eq(_col: string, _val: unknown) {
                orderUpdates.push(payload as Record<string, unknown>);
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
          delete() {
            return {
              eq(_col: string, val: unknown) {
                deleted.push(val as string);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "order_items") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, _val: unknown) {
                return Promise.resolve({ data: existingItems, error: null });
              },
            };
          },
          insert(_payload: unknown) {
            return Promise.resolve({ error: insertItemsError });
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return admin;
}

// ---------------------------------------------------------------------------
// Base deps
// ---------------------------------------------------------------------------

const DEPS_BASE = {
  redirectUrlFor: (gt: string, l: string) => `https://s/${l}/store/track/${gt}`,
  ipnUrl: "https://s/api/payments/icredit/ipn",
  sendOwnerEmail: async () => {},
  ownerOrderUrlFor: (id: string) => `https://s/admin/${id}`,
  userId: null,
  now: () => "2026-06-28T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("confirmStoreOrder", () => {
  it("redirect: returns the payment URL and does not call finalize", async () => {
    const finalize = vi.fn(async () => ({ ok: true, alreadyPaid: false }));
    const res = await confirmStoreOrder(INPUT, {
      ...DEPS_BASE,
      admin: makeFakeAdmin() as unknown as ConfirmStoreOrderDeps["admin"],
      paymentProvider: {
        createCheckout: async () => ({
          status: "redirect" as const,
          url: "https://pay/x",
          reference: "pub",
        }),
      },
      finalizePaidOrder: finalize,
    });
    expect(res).toMatchObject({ ok: true, redirectUrl: "https://pay/x" });
    expect(finalize).not.toHaveBeenCalled();
  });

  it("paid: calls finalize with correct args and returns ok without redirectUrl", async () => {
    const finalize = vi.fn(async () => ({ ok: true, alreadyPaid: false }));
    const res = await confirmStoreOrder(INPUT, {
      ...DEPS_BASE,
      admin: makeFakeAdmin() as unknown as ConfirmStoreOrderDeps["admin"],
      paymentProvider: {
        createCheckout: async () => ({
          status: "paid" as const,
          reference: "mock-ref",
        }),
      },
      finalizePaidOrder: finalize,
    });
    expect(res).toMatchObject({ ok: true });
    expect((res as { ok: true; redirectUrl?: string }).redirectUrl).toBeUndefined();
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-id",
        provider: "mock",
        saleId: "mock-ref",
        reference: "mock-ref",
        receiptDocumentUrl: null,
        receiptDocumentNumber: null,
      }),
    );
  });

  it("failed: deletes the order and returns payment_failed without calling finalize", async () => {
    const fakeAdmin = makeFakeAdmin();
    const finalize = vi.fn();
    const res = await confirmStoreOrder(INPUT, {
      ...DEPS_BASE,
      admin: fakeAdmin as unknown as ConfirmStoreOrderDeps["admin"],
      paymentProvider: {
        createCheckout: async () => ({
          status: "failed" as const,
          reason: "declined",
        }),
      },
      finalizePaidOrder: finalize,
    });
    expect(res).toEqual({ ok: false, message: "payment_failed" });
    expect(fakeAdmin._deleted).toContain("order-id");
    expect(finalize).not.toHaveBeenCalled();
  });

  it("idempotent-paid: returns ok when existing order is already paid", async () => {
    const finalize = vi.fn();
    const res = await confirmStoreOrder(INPUT, {
      ...DEPS_BASE,
      admin: makeFakeAdmin({
        existingOrder: {
          id: "order-id",
          guest_token: "tok_abc",
          payment_status: "paid",
        },
      }) as unknown as ConfirmStoreOrderDeps["admin"],
      paymentProvider: { createCheckout: vi.fn() as never },
      finalizePaidOrder: finalize,
    });
    expect(res).toEqual({ ok: true, orderId: "order-id", guestToken: "tok_abc" });
    expect(finalize).not.toHaveBeenCalled();
  });

  it("idempotent-reissue (redirect): re-issues checkout and returns redirectUrl", async () => {
    const finalize = vi.fn();
    const res = await confirmStoreOrder(INPUT, {
      ...DEPS_BASE,
      admin: makeFakeAdmin({
        existingOrder: {
          id: "order-id",
          guest_token: "tok_abc",
          payment_status: "awaiting_payment",
          price_total: 1500,
          price_currency: "ILS",
          delivery_method: "pickup",
          contact_first_name: "Dana",
          contact_last_name: "Cohen",
          contact_email: "dana@example.com",
          contact_phone: "+972501234567",
          ship_address_line1: null,
          ship_city: null,
          ship_postal_code: null,
        },
        existingItems: [
          {
            product_id: "p1",
            title_he: "מדבקה",
            title_en: "Sticker",
            image_url: null,
            options: [],
            quantity: 1,
            unit_price: 1500,
            line_total: 1500,
          },
        ],
      }) as unknown as ConfirmStoreOrderDeps["admin"],
      paymentProvider: {
        createCheckout: async () => ({
          status: "redirect" as const,
          url: "https://pay/reissue",
          reference: "pub2",
        }),
      },
      finalizePaidOrder: finalize,
    });
    expect(res).toMatchObject({ ok: true, redirectUrl: "https://pay/reissue" });
    expect(finalize).not.toHaveBeenCalled();
  });
});
