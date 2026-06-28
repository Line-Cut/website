// Mock "server-only" so the module can be imported in tests
vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { runStorePaidSideEffects } from "@/lib/orders/store-paid-side-effects";

// ---------------------------------------------------------------------------
// Fixtures (copied from finalize-paid-order.test.ts)
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

const ITEM_ROW = {
  title_he: "מדבקה",
  title_en: "Sticker",
  options: [],
  quantity: 2,
  unit_price: 500,
  line_total: 1000,
};

// ---------------------------------------------------------------------------
// Fake admin builder
// ---------------------------------------------------------------------------

function makeFakeAdmin({ items = [] as unknown[] } = {}) {
  const admin = {
    from(table: string) {
      if (table === "order_items") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, _val: unknown) {
                return Promise.resolve({ data: items, error: null });
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

describe("runStorePaidSideEffects", () => {
  it("loads order_items, builds the owner email, and sends it", async () => {
    const emails: unknown[] = [];
    const admin = makeFakeAdmin({ items: [ITEM_ROW] });
    await runStorePaidSideEffects(STORE_ORDER_ROW, {
      admin: admin as never,
      sendOwnerEmail: async (e) => {
        emails.push(e);
      },
      ownerOrderUrlFor: (id) => `https://s/admin/${id}`,
    });
    expect(emails).toHaveLength(1);
    const email = emails[0] as { subject: string; text: string; replyTo: string };
    expect(email.subject).toContain("store order");
    expect(email.replyTo).toBe("dana@example.com");
    expect(email.text).toContain("Dana Cohen");
    expect(email.text).toContain("Sticker");
  });

  it("propagates errors from sendOwnerEmail (caller is responsible for try/catch)", async () => {
    const admin = makeFakeAdmin({ items: [ITEM_ROW] });
    await expect(
      runStorePaidSideEffects(STORE_ORDER_ROW, {
        admin: admin as never,
        sendOwnerEmail: async () => {
          throw new Error("smtp down");
        },
        ownerOrderUrlFor: () => "x",
      }),
    ).rejects.toThrow("smtp down");
  });
});
