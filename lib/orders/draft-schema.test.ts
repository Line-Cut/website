import { describe, it, expect } from "vitest";
import { parseDraft, parseUpdateDraft } from "@/lib/orders/draft-schema";
import { stickerConfig } from "@/lib/stickers/sticker-config";

const validMeta = {
  filename: "hello.webp",
  bytes: 1024,
  contentType: "image/webp",
  width: 512,
  height: 512,
};

function makeStickers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    ...validMeta,
    filename: `sticker-${i}.webp`,
  }));
}

describe("parseDraft", () => {
  it("accepts valid input", () => {
    const result = parseDraft({ stickers: [validMeta], copies: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stickers).toHaveLength(1);
      expect(result.data.copies).toBe(1);
    }
  });

  it("accepts multiple stickers with copies > 1", () => {
    const result = parseDraft({ stickers: makeStickers(5), copies: 3 });
    expect(result.success).toBe(true);
  });

  it("rejects 0 stickers", () => {
    const result = parseDraft({ stickers: [], copies: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    }
  });

  it("rejects sticker count exceeding maxStickers", () => {
    const result = parseDraft({
      stickers: makeStickers(stickerConfig.maxStickers + 1),
      copies: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    }
  });

  it("rejects non-webp contentType with not_webp message", () => {
    const result = parseDraft({
      stickers: [{ ...validMeta, contentType: "image/png" }],
      copies: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Error key for first sticker's contentType
      const contentTypeKey = "stickers.0.contentType";
      expect(result.errors[contentTypeKey]).toBe("not_webp");
    }
  });

  it("rejects oversize bytes (> maxFileBytes)", () => {
    const result = parseDraft({
      stickers: [{ ...validMeta, bytes: stickerConfig.maxFileBytes + 1 }],
      copies: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    }
  });

  it("rejects bytes = 0", () => {
    const result = parseDraft({
      stickers: [{ ...validMeta, bytes: 0 }],
      copies: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects copies = 0", () => {
    const result = parseDraft({ stickers: [validMeta], copies: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors["copies"]).toBeDefined();
    }
  });

  it("rejects negative copies", () => {
    const result = parseDraft({ stickers: [validMeta], copies: -1 });
    expect(result.success).toBe(false);
  });

  it("allows width and height = 0 (unknown dimensions)", () => {
    const result = parseDraft({
      stickers: [{ ...validMeta, width: 0, height: 0 }],
      copies: 1,
    });
    expect(result.success).toBe(true);
  });

  it("returns first-error-per-field and does not duplicate keys", () => {
    // Trigger multiple issues on a single sticker
    const result = parseDraft({
      stickers: [
        { ...validMeta, contentType: "image/png", bytes: 0 },
      ],
      copies: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Each key appears at most once
      const keys = Object.keys(result.errors);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

const meta = { filename: "a.webp", bytes: 1024, contentType: "image/webp", width: 64, height: 64 };

describe("parseUpdateDraft", () => {
  it("accepts keep-only", () => {
    const r = parseUpdateDraft({ orderId: "o1", keepStickerIds: ["s1"], addStickers: [], copies: 1 });
    expect(r.success).toBe(true);
  });
  it("accepts add-only", () => {
    const r = parseUpdateDraft({ orderId: "o1", keepStickerIds: [], addStickers: [meta], copies: 2 });
    expect(r.success).toBe(true);
  });
  it("rejects an empty final set (no keep, no add)", () => {
    const r = parseUpdateDraft({ orderId: "o1", keepStickerIds: [], addStickers: [], copies: 1 });
    expect(r.success).toBe(false);
  });
  it("rejects copies < 1", () => {
    const r = parseUpdateDraft({ orderId: "o1", keepStickerIds: ["s1"], addStickers: [], copies: 0 });
    expect(r.success).toBe(false);
  });
  it("rejects a non-webp added sticker", () => {
    const r = parseUpdateDraft({ orderId: "o1", keepStickerIds: [], addStickers: [{ ...meta, contentType: "image/png" }], copies: 1 });
    expect(r.success).toBe(false);
  });
});
