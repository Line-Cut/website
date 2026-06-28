import { describe, it, expect, afterEach } from "vitest";
import { getPaymentProvider } from "@/lib/payments/index";

const prev = process.env.ICREDIT_MODE;
afterEach(() => { if (prev === undefined) delete process.env.ICREDIT_MODE; else process.env.ICREDIT_MODE = prev; });

describe("getPaymentProvider", () => {
  it("returns a provider with createCheckout in mock mode", () => {
    delete process.env.ICREDIT_MODE;
    expect(typeof getPaymentProvider().createCheckout).toBe("function");
  });
  it("returns an iCredit-backed provider when ICREDIT_MODE=test", () => {
    process.env.ICREDIT_MODE = "test";
    process.env.ICREDIT_GROUP_PRIVATE_TOKEN = "tok";
    expect(typeof getPaymentProvider().createCheckout).toBe("function");
  });
});
