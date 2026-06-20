import { describe, it, expect } from "vitest";
import { formatMoney, interpolate } from "@/lib/stickers/format";

describe("formatMoney", () => {
  it("en locale: contains numeric part '123.45' for 12345 minor units", () => {
    const result = formatMoney(12345, "ILS", "en");
    expect(result).toBeTruthy();
    expect(result).toContain("123.45");
  });

  it("en locale: contains a currency symbol (₪ or ILS)", () => {
    const result = formatMoney(12345, "ILS", "en");
    expect(result.includes("₪") || result.includes("ILS")).toBe(true);
  });

  it("en locale: zero amount contains '0.00'", () => {
    const result = formatMoney(0, "ILS", "en");
    expect(result).toBeTruthy();
    expect(result).toContain("0.00");
  });

  it("he locale: returns a non-empty string for 12345 minor units", () => {
    const result = formatMoney(12345, "ILS", "he");
    expect(result).toBeTruthy();
    expect(result).toContain("123.45");
  });

  it("he locale: zero amount is non-empty", () => {
    const result = formatMoney(0, "ILS", "he");
    expect(result).toBeTruthy();
  });
});

describe("interpolate", () => {
  it("replaces known placeholders with string values", () => {
    expect(interpolate("{n}/{max} left", { n: 3, max: 200 })).toBe("3/200 left");
  });

  it("coerces number values to strings", () => {
    expect(interpolate("copies: {copies}", { copies: 5 })).toBe("copies: 5");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(interpolate("hi {x}", {})).toBe("hi {x}");
  });

  it("replaces only matching keys, leaves unknown ones intact", () => {
    expect(interpolate("{known} and {unknown}", { known: "yes" })).toBe(
      "yes and {unknown}",
    );
  });

  it("handles template with no placeholders", () => {
    expect(interpolate("hello world", {})).toBe("hello world");
  });
});
