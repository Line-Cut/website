import { describe, it, expect } from "vitest";
import { agorotToShekels, shekelsToAgorot, amountMatches } from "@/lib/payments/icredit/money";

describe("money", () => {
  it("agorot → shekels (2-decimal)", () => {
    expect(agorotToShekels(12345)).toBe(123.45);
    expect(agorotToShekels(100)).toBe(1);
    expect(agorotToShekels(0)).toBe(0);
  });
  it("shekels → agorot (rounds)", () => {
    expect(shekelsToAgorot(123.45)).toBe(12345);
    expect(shekelsToAgorot(1)).toBe(100);
    expect(shekelsToAgorot(0.1 + 0.2)).toBe(30); // float-safe
  });
  it("amountMatches compares shekels-IPN to agorot-order", () => {
    expect(amountMatches(123.45, 12345)).toBe(true);
    expect(amountMatches(123.44, 12345)).toBe(false);
  });
});
