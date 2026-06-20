import { describe, it, expect } from "vitest";
import { computePrice } from "@/lib/stickers/pricing";
import type { StickerConfig } from "@/lib/stickers/sticker-config";
import { stickerConfig } from "@/lib/stickers/sticker-config";

// Non-zero rates so math is observable
const testCfg: StickerConfig = {
  ...stickerConfig,
  perSheetRate: 500,  // 5.00 ILS in agorot
  setupFee: 1500,     // 15.00 ILS in agorot
};

// Default config → perSheet=15 (3 columns × 5 rows)

describe("computePrice", () => {
  it("0 stickers → sheetsPerSet 0, totalSheets 0, setupFee 0, total 0", () => {
    const result = computePrice(0, 1, testCfg);
    expect(result.sheetsPerSet).toBe(0);
    expect(result.totalSheets).toBe(0);
    expect(result.setupFee).toBe(0);
    expect(result.total).toBe(0);
    expect(result.uniqueCount).toBe(0);
    expect(result.copies).toBe(1);
  });

  it("uniqueCount === perSheet → sheetsPerSet 1", () => {
    const result = computePrice(15, 1, testCfg);
    expect(result.perSheet).toBe(15);
    expect(result.sheetsPerSet).toBe(1);
    expect(result.totalSheets).toBe(1);
    expect(result.sheetsSubtotal).toBe(500);
    expect(result.setupFee).toBe(1500);
    expect(result.total).toBe(2000);
  });

  it("uniqueCount === perSheet+1 → sheetsPerSet 2 (ceil)", () => {
    const result = computePrice(16, 1, testCfg);
    expect(result.sheetsPerSet).toBe(2);
    expect(result.totalSheets).toBe(2);
    expect(result.sheetsSubtotal).toBe(1000);
    expect(result.total).toBe(2500);
  });

  it("200 stickers, copies 1 → correct sheetsPerSet, totalSheets, total", () => {
    const result = computePrice(200, 1, testCfg);
    // ceil(200/15) = ceil(13.33) = 14
    expect(result.sheetsPerSet).toBe(14);
    expect(result.totalSheets).toBe(14);
    expect(result.sheetsSubtotal).toBe(14 * 500);
    expect(result.setupFee).toBe(1500);
    expect(result.total).toBe(14 * 500 + 1500);
  });

  it("copies 0 → treated as 1", () => {
    const a = computePrice(15, 0, testCfg);
    const b = computePrice(15, 1, testCfg);
    expect(a.totalSheets).toBe(b.totalSheets);
    expect(a.total).toBe(b.total);
  });

  it("copies -3 → treated as 1", () => {
    const a = computePrice(15, -3, testCfg);
    const b = computePrice(15, 1, testCfg);
    expect(a.totalSheets).toBe(b.totalSheets);
    expect(a.total).toBe(b.total);
  });

  it("copies 2.7 → floored to 2", () => {
    const result = computePrice(15, 2.7, testCfg);
    expect(result.totalSheets).toBe(2);
    expect(result.sheetsSubtotal).toBe(2 * 500);
    expect(result.total).toBe(2 * 500 + 1500);
  });

  it("setup fee applied once regardless of copies count", () => {
    const result1 = computePrice(15, 1, testCfg);
    const result3 = computePrice(15, 3, testCfg);
    expect(result1.setupFee).toBe(1500);
    expect(result3.setupFee).toBe(1500);
    expect(result3.totalSheets).toBe(3);
    expect(result3.sheetsSubtotal).toBe(1500);
    expect(result3.total).toBe(3000);
  });

  it("setup fee absent (0) when uniqueCount is 0", () => {
    const result = computePrice(0, 5, testCfg);
    expect(result.setupFee).toBe(0);
    expect(result.total).toBe(0);
  });

  it("currency carried through unchanged", () => {
    const ilsCfg = { ...testCfg, currency: "ILS" as const };
    expect(computePrice(10, 1, ilsCfg).currency).toBe("ILS");
  });

  it("determinism: same inputs produce deeply-equal breakdown", () => {
    const a = computePrice(42, 3, testCfg);
    const b = computePrice(42, 3, testCfg);
    expect(a).toEqual(b);
  });

  it("result carries all PriceBreakdown fields with integer minor units", () => {
    const result = computePrice(30, 2, testCfg);
    expect(Number.isInteger(result.sheetsSubtotal)).toBe(true);
    expect(Number.isInteger(result.setupFee)).toBe(true);
    expect(Number.isInteger(result.total)).toBe(true);
    expect(result.copies).toBe(2);
    expect(result.uniqueCount).toBe(30);
  });
});
