import { describe, it, expect } from "vitest";
import { computePacking } from "@/lib/stickers/packing";
import type { StickerConfig } from "@/lib/stickers/sticker-config";
import { stickerConfig } from "@/lib/stickers/sticker-config";

// Helper to build a minimal test config
function makeConfig(overrides: Partial<StickerConfig>): StickerConfig {
  return { ...stickerConfig, ...overrides };
}

describe("computePacking", () => {
  it("default config → columns=3, rows=5, perSheet=15", () => {
    // A4: 210×297, margin=8 → usable 194×281
    // fit(194) = floor((194+3)/(50+3)) = floor(197/53) = floor(3.716) = 3
    // fit(281) = floor((281+3)/(50+3)) = floor(284/53) = floor(5.358) = 5
    const result = computePacking();
    expect(result.columns).toBe(3);
    expect(result.rows).toBe(5);
    expect(result.perSheet).toBe(15);
  });

  it("degenerate: sticker larger than usable width → columns/rows/perSheet = 0 (no divide-by-zero)", () => {
    const cfg = makeConfig({
      stickerSizeMm: 500,
      sheet: { widthMm: 100, heightMm: 100, marginMm: 5 },
    });
    const result = computePacking(cfg);
    expect(result.columns).toBe(0);
    expect(result.rows).toBe(0);
    expect(result.perSheet).toBe(0);
  });

  it("exact-fit: size+gutter+margin chosen to fit exactly with no off-by-one", () => {
    // usableW = 210 - 2*5 = 200
    // want exactly 4 columns: 4*(53) - 3 = 212 - 3 = 209 ≠ 200. try size=47, gutter=3
    // fit(200) = floor((200+3)/(47+3)) = floor(203/50) = floor(4.06) = 4
    // usableH = 150 - 2*5 = 140
    // fit(140) = floor((140+3)/(47+3)) = floor(143/50) = floor(2.86) = 2
    const cfg = makeConfig({
      stickerSizeMm: 47,
      gutterMm: 3,
      sheet: { widthMm: 210, heightMm: 150, marginMm: 5 },
    });
    const result = computePacking(cfg);
    expect(result.columns).toBe(4);
    expect(result.rows).toBe(2);
    expect(result.perSheet).toBe(8);
  });

  it("exact-fit: usable width is exact multiple of (size+gutter), trailing gutter dropped correctly", () => {
    // usableW = 2*margin + n*(size+gutter) - gutter
    // Let size=47, gutter=3, cellMm=50, margin=0
    // usableW = n*50 - 3 → for n=4: 200-3=197
    // sheet widthMm = 197 (margin=0 → usable=197)
    // fit(197) = floor((197+3)/50) = floor(200/50) = 4  ✓ (no off-by-one)
    const cfg = makeConfig({
      stickerSizeMm: 47,
      gutterMm: 3,
      sheet: { widthMm: 197, heightMm: 97, marginMm: 0 },
    });
    const result = computePacking(cfg);
    // usableH=97 → fit(97)=floor(100/50)=2
    expect(result.columns).toBe(4);
    expect(result.rows).toBe(2);
    expect(result.perSheet).toBe(8);
    expect(result.cellMm).toBe(50);
  });

  it("returns usableMm matching sheet minus 2×margin", () => {
    const result = computePacking();
    expect(result.usableMm.width).toBe(210 - 2 * 8);  // 194
    expect(result.usableMm.height).toBe(297 - 2 * 8); // 281
  });
});
