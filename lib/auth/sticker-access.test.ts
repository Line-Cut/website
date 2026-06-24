import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isStickerShopUser,
  isStickerShopRestricted,
  DEFAULT_STICKER_SHOP_EMAILS,
} from "./sticker-access";

describe("isStickerShopUser", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("with the built-in default allow-list (no env override)", () => {
    beforeEach(() => {
      delete process.env.STICKER_SHOP_ALLOWED_EMAILS;
    });

    it("allows each default email", () => {
      for (const email of DEFAULT_STICKER_SHOP_EMAILS) {
        expect(isStickerShopUser(email)).toBe(true);
      }
    });

    it("is case-insensitive and trims surrounding whitespace", () => {
      expect(isStickerShopUser("  YUVAL.ALTUN101@Gmail.com ")).toBe(true);
      expect(isStickerShopUser("LineCut1973@GMAIL.COM")).toBe(true);
    });

    it("rejects an email not on the list", () => {
      expect(isStickerShopUser("stranger@example.com")).toBe(false);
    });
  });

  it("rejects null, undefined, and empty emails", () => {
    expect(isStickerShopUser(null)).toBe(false);
    expect(isStickerShopUser(undefined)).toBe(false);
    expect(isStickerShopUser("")).toBe(false);
    expect(isStickerShopUser("   ")).toBe(false);
  });

  describe("with STICKER_SHOP_ALLOWED_EMAILS override", () => {
    it("matches only the configured emails (case-insensitive, whitespace-tolerant)", () => {
      process.env.STICKER_SHOP_ALLOWED_EMAILS =
        "  Owner@Shop.com , second@shop.com ";
      expect(isStickerShopUser("owner@shop.com")).toBe(true);
      expect(isStickerShopUser("SECOND@SHOP.COM")).toBe(true);
      expect(isStickerShopUser("third@shop.com")).toBe(false);
    });

    it("replaces the default list when set", () => {
      process.env.STICKER_SHOP_ALLOWED_EMAILS = "owner@shop.com";
      expect(isStickerShopUser(DEFAULT_STICKER_SHOP_EMAILS[0])).toBe(false);
      expect(isStickerShopUser("owner@shop.com")).toBe(true);
    });

    it("falls back to the default list when set to an empty/whitespace string", () => {
      process.env.STICKER_SHOP_ALLOWED_EMAILS = "   ";
      expect(isStickerShopUser(DEFAULT_STICKER_SHOP_EMAILS[0])).toBe(true);
    });
  });
});

describe("isStickerShopRestricted", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("is restricted by default when STICKER_SHOP_PUBLIC is unset", () => {
    delete process.env.STICKER_SHOP_PUBLIC;
    expect(isStickerShopRestricted()).toBe(true);
  });

  it("opens the shop for each truthy value (case/whitespace-insensitive)", () => {
    for (const v of ["true", "1", "yes", "on", " TRUE ", "On"]) {
      process.env.STICKER_SHOP_PUBLIC = v;
      expect(isStickerShopRestricted()).toBe(false);
    }
  });

  it("stays restricted for empty or non-truthy values", () => {
    for (const v of ["", "false", "0", "no", "off", "nope"]) {
      process.env.STICKER_SHOP_PUBLIC = v;
      expect(isStickerShopRestricted()).toBe(true);
    }
  });
});
