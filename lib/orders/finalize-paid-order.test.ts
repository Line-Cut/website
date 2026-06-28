// Mock "server-only" so the module can be imported in tests
vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { finalizePaidOrder } from "@/lib/orders/finalize-paid-order";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STORE_ORDER_ROW = {
  id: "o1",
  order_kind: "store",
  contact_name: "Dana Cohen",
  contact_first_name: "Dana",
  contact_last_name: "Cohen",
  contact_email: "dana@example.com",
  contact_phone: "+972501234567",
  price_total: 1200,
  price_currency: "ILS",
  delivery_method: "pickup",
  ship_address_line1: null,
  ship_address_line2: null,
  ship_city: null,
  ship_postal_code: null,
  ship_country: null,
  ship_notes: null,
};

// ---------------------------------------------------------------------------
// Fake admin builder
// ---------------------------------------------------------------------------

function makeFakeAdmin({
  updatedRows = [] as unknown[],
  updateError = null as { message: string } | null,
} = {}) {
  let lastOrderUpdate: unknown = null;

  const admin = {
    get _lastOrderUpdate() {
      return lastOrderUpdate;
    },
    from(table: string) {
      if (table === "orders") {
        return {
          update(payload: unknown) {
            lastOrderUpdate = payload;
            return {
              eq(_col: string, _val: unknown) {
                return {
                  neq(_col: string, _val: unknown) {
                    return {
                      select(_cols: string) {
                        return Promise.resolve({
                          data: updateError ? null : updatedRows,
                          error: updateError,
                        });
                      },
                    };
                  },
                };
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
// Tests
// ---------------------------------------------------------------------------

describe("finalizePaidOrder", () => {
  it("marks an awaiting order paid, sets receipt fields + confirmed_at, calls onPaid once with the order", async () => {
    const onPaid = vi.fn().mockResolvedValue(undefined);
    const admin = makeFakeAdmin({ updatedRows: [STORE_ORDER_ROW] });
    const res = await finalizePaidOrder(
      {
        orderId: "o1",
        paidAtISO: "2026-06-28T00:00:00.000Z",
        provider: "icredit",
        saleId: "sale-1",
        reference: "auth-7",
        receiptDocumentUrl: "https://r/d.pdf",
        receiptDocumentNumber: "665",
      },
      {
        admin: admin as never,
        onPaid,
        now: () => "2026-06-28T12:00:00.000Z",
      },
    );
    expect(res).toEqual({ ok: true, alreadyPaid: false });
    const payload = admin._lastOrderUpdate as Record<string, unknown>;
    expect(payload.payment_status).toBe("paid");
    expect(payload.payment_provider).toBe("icredit");
    expect(payload.provider_sale_id).toBe("sale-1");
    expect(payload.payment_reference).toBe("auth-7");
    expect(payload.receipt_document_url).toBe("https://r/d.pdf");
    expect(payload.receipt_document_number).toBe("665");
    expect(payload.paid_at).toBe("2026-06-28T00:00:00.000Z");
    expect(payload.confirmed_at).toBe("2026-06-28T12:00:00.000Z");
    expect(onPaid).toHaveBeenCalledOnce();
    expect(onPaid).toHaveBeenCalledWith(STORE_ORDER_ROW);
  });

  it("is a no-op when already paid (0 rows updated) and does not call onPaid", async () => {
    const onPaid = vi.fn();
    const admin = makeFakeAdmin({ updatedRows: [] });
    const res = await finalizePaidOrder(
      {
        orderId: "o1",
        paidAtISO: "t",
        provider: "icredit",
        saleId: "s",
        reference: null,
        receiptDocumentUrl: null,
        receiptDocumentNumber: null,
      },
      {
        admin: admin as never,
        onPaid,
      },
    );
    expect(res).toEqual({ ok: true, alreadyPaid: true });
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("never fails the order when onPaid throws", async () => {
    const admin = makeFakeAdmin({ updatedRows: [STORE_ORDER_ROW] });
    const res = await finalizePaidOrder(
      {
        orderId: "o1",
        paidAtISO: "t",
        provider: "icredit",
        saleId: "s",
        reference: null,
        receiptDocumentUrl: null,
        receiptDocumentNumber: null,
      },
      {
        admin: admin as never,
        onPaid: async () => {
          throw new Error("smtp down");
        },
      },
    );
    expect(res).toEqual({ ok: true, alreadyPaid: false });
  });

  it("returns ok:false when the DB update errors", async () => {
    const admin = makeFakeAdmin({ updateError: { message: "db down" } });
    const res = await finalizePaidOrder(
      {
        orderId: "o1",
        paidAtISO: "t",
        provider: "p",
        saleId: null,
        reference: null,
        receiptDocumentUrl: null,
        receiptDocumentNumber: null,
      },
      {
        admin: admin as never,
      },
    );
    expect(res).toEqual({ ok: false, message: "db_error" });
  });
});
