import { describe, it, expect } from "vitest";
import { nextNavigation } from "@/lib/store/checkout-navigation";

describe("nextNavigation", () => {
  it("redirects to the payment URL when present", () => {
    expect(nextNavigation({ ok: true, guestToken: "gt", redirectUrl: "https://pay/x" }, "he"))
      .toEqual({ kind: "redirect", url: "https://pay/x" });
  });
  it("falls back to the track page (mock/paid path)", () => {
    expect(nextNavigation({ ok: true, guestToken: "gt" }, "en"))
      .toEqual({ kind: "track", href: "/en/store/track/gt" });
  });
});
