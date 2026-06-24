import { describe, it, expect } from "vitest";
import { manualPaymentProvider } from "@/lib/payments/manual-provider";
import { getPaymentProvider } from "@/lib/payments/index";

describe("manualPaymentProvider", () => {
  it("createCharge simulates a successful payment (status paid)", async () => {
    const result = await manualPaymentProvider.createCharge({
      orderId: "o1",
      amount: 5000,
      currency: "ILS",
    });
    expect(result).toEqual({ status: "paid", reference: "MOCK-o1" });
  });

  it("createCharge returns a mock reference derived from the order id", async () => {
    const result = await manualPaymentProvider.createCharge({
      orderId: "o2",
      amount: 0,
      currency: "ILS",
    });
    expect(result.status).toBe("paid");
    expect((result as { reference?: string }).reference).toBe("MOCK-o2");
  });
});

describe("getPaymentProvider", () => {
  it("returns an object with a createCharge function", () => {
    const provider = getPaymentProvider();
    expect(typeof provider.createCharge).toBe("function");
  });
});
