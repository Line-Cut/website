import { describe, test, expect } from "vitest";
import { clientKey, orderPrefix, stickerKey } from "./keys";

describe("clientKey", () => {
  test("returns u_{userId} when userId is truthy", () => {
    expect(clientKey({ userId: "abc123", guestToken: "tok" })).toBe("u_abc123");
  });

  test("returns g_{guestToken} when userId is null", () => {
    expect(clientKey({ userId: null, guestToken: "guestXYZ" })).toBe(
      "g_guestXYZ"
    );
  });

  test("returns g_{guestToken} when userId is undefined", () => {
    expect(clientKey({ userId: undefined, guestToken: "tokenABC" })).toBe(
      "g_tokenABC"
    );
  });

  test("returns g_{guestToken} when userId is empty string", () => {
    expect(clientKey({ userId: "", guestToken: "tok" })).toBe("g_tok");
  });
});

describe("orderPrefix", () => {
  test("composes clientKey with orderId for logged-in user", () => {
    expect(
      orderPrefix({ userId: "user1", guestToken: "tok", orderId: "ord123" })
    ).toBe("u_user1/ord123");
  });

  test("composes clientKey with orderId for guest", () => {
    expect(
      orderPrefix({ userId: null, guestToken: "guestTok", orderId: "ord456" })
    ).toBe("g_guestTok/ord456");
  });
});

describe("stickerKey", () => {
  test("builds full S3 key for a guest sticker", () => {
    expect(
      stickerKey({
        userId: null,
        guestToken: "tok",
        orderId: "ord123",
        stickerId: "stk1",
      })
    ).toBe("g_tok/ord123/stk1.webp");
  });

  test("builds full S3 key for a logged-in user sticker", () => {
    expect(
      stickerKey({
        userId: "u42",
        guestToken: "ignored",
        orderId: "ord99",
        stickerId: "stickerA",
      })
    ).toBe("u_u42/ord99/stickerA.webp");
  });
});
