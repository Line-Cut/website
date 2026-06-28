import { describe, it, expect } from "vitest";
import { manualPaymentProvider } from "@/lib/payments/manual-provider";
import { getPaymentProvider } from "@/lib/payments/index";
import type { CreateCheckoutInput } from "@/lib/payments/provider";

const INPUT: CreateCheckoutInput = {
  orderId: "o1", amount: 5000, currency: "ILS", locale: "he",
  items: [{ description: "X", catalogNumber: null, unitPrice: 5000, quantity: 1 }],
  customer: { firstName: "A", lastName: "B", email: "a@b.c", phone: "0500000000" },
  redirectUrl: "https://site/thanks", ipnUrl: "https://site/ipn",
};

describe("manualPaymentProvider", () => {
  it("createCheckout returns paid with a mock reference", async () => {
    expect(await manualPaymentProvider.createCheckout(INPUT)).toEqual({
      status: "paid", reference: "MOCK-o1",
    });
  });
});

describe("getPaymentProvider", () => {
  it("returns a provider exposing createCheckout", () => {
    expect(typeof getPaymentProvider().createCheckout).toBe("function");
  });
});
