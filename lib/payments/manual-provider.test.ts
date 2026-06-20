import { describe, it, expect } from "vitest";
import { manualPaymentProvider } from "@/lib/payments/manual-provider";
import { getPaymentProvider } from "@/lib/payments/index";

describe("manualPaymentProvider", () => {
  it("createCharge resolves with status awaiting_payment", async () => {
    const result = await manualPaymentProvider.createCharge({
      orderId: "o1",
      amount: 5000,
      currency: "ILS",
    });
    expect(result).toEqual({ status: "awaiting_payment" });
  });

  it("createCharge resolves without a reference (no charge taken)", async () => {
    const result = await manualPaymentProvider.createCharge({
      orderId: "o2",
      amount: 0,
      currency: "ILS",
    });
    expect(result.status).toBe("awaiting_payment");
    expect((result as { reference?: string }).reference).toBeUndefined();
  });
});

describe("getPaymentProvider", () => {
  it("returns an object with a createCharge function", () => {
    const provider = getPaymentProvider();
    expect(typeof provider.createCharge).toBe("function");
  });
});
