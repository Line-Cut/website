// Mock "server-only" so the module can be imported in tests
vi.mock("server-only", () => ({}));

import { describe, it, expect, vi } from "vitest";
import { markOrderPaid } from "@/lib/orders/mark-paid";
import type { MarkOrderPaidDeps } from "@/lib/orders/mark-paid";

const RECEIPT = {
  orderId: "order-uuid",
  amount: 1200,
  currency: "ILS",
  reference: "MOCK-order-uuid",
  paidAtISO: "2024-06-01T12:00:00.000Z",
};

function makeFakeAdmin({ updateError = null as { message: string } | null } = {}) {
  const updates: { payload: unknown; filter: Record<string, unknown> }[] = [];
  return {
    _updates: updates,
    from(_table: string) {
      return {
        update(payload: unknown) {
          const filter: Record<string, unknown> = {};
          return {
            eq(col: string, val: unknown) {
              filter[col] = val;
              updates.push({ payload, filter });
              return Promise.resolve({ error: updateError });
            },
          };
        },
      };
    },
  };
}

function makeDeps(overrides: Partial<MarkOrderPaidDeps> = {}): MarkOrderPaidDeps {
  return {
    admin: makeFakeAdmin() as unknown as MarkOrderPaidDeps["admin"],
    copyOrderFolderToPaid: vi.fn(async () => {}),
    writeReceipt: vi.fn(async (prefix: string) => `${prefix}/receipt.pdf`),
    ...overrides,
  };
}

describe("markOrderPaid", () => {
  it("copies the folder, writes the receipt, and records the receipt key", async () => {
    const fakeAdmin = makeFakeAdmin();
    const deps = makeDeps({
      admin: fakeAdmin as unknown as MarkOrderPaidDeps["admin"],
    });

    const result = await markOrderPaid(
      { orderId: "order-uuid", storagePrefix: "order-uuid-Dana-Cohen-972", receipt: RECEIPT },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      receiptStorageKey: "order-uuid-Dana-Cohen-972/receipt.pdf",
    });
    expect(deps.copyOrderFolderToPaid).toHaveBeenCalledWith(
      "order-uuid-Dana-Cohen-972",
    );
    expect(deps.writeReceipt).toHaveBeenCalledWith(
      "order-uuid-Dana-Cohen-972",
      RECEIPT,
    );
    expect(fakeAdmin._updates).toHaveLength(1);
    expect(fakeAdmin._updates[0]).toEqual({
      payload: { receipt_storage_key: "order-uuid-Dana-Cohen-972/receipt.pdf" },
      filter: { id: "order-uuid" },
    });
  });

  it("copies before writing the receipt (order of operations)", async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      copyOrderFolderToPaid: vi.fn(async () => {
        calls.push("copy");
      }),
      writeReceipt: vi.fn(async (prefix: string) => {
        calls.push("receipt");
        return `${prefix}/receipt.pdf`;
      }),
    });

    await markOrderPaid(
      { orderId: "order-uuid", storagePrefix: "p", receipt: RECEIPT },
      deps,
    );

    expect(calls).toEqual(["copy", "receipt"]);
  });

  it("returns ok:false db_error when the receipt-key update fails", async () => {
    const fakeAdmin = makeFakeAdmin({ updateError: { message: "boom" } });
    const deps = makeDeps({
      admin: fakeAdmin as unknown as MarkOrderPaidDeps["admin"],
    });

    const result = await markOrderPaid(
      { orderId: "order-uuid", storagePrefix: "p", receipt: RECEIPT },
      deps,
    );

    expect(result).toEqual({ ok: false, message: "db_error" });
  });
});
