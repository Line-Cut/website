// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  FEATURES,
  isFeatureKey,
  featureDefaultVisibility,
  evaluateFeatureAccess,
} from "./feature-access";

describe("FEATURES registry", () => {
  it("lists stickers (restricted) and store (public) as defaults", () => {
    expect(FEATURES.map((f) => f.key)).toEqual(["stickers", "store"]);
    expect(featureDefaultVisibility("stickers")).toBe("restricted");
    expect(featureDefaultVisibility("store")).toBe("public");
  });

  it("isFeatureKey accepts known keys and rejects others", () => {
    expect(isFeatureKey("stickers")).toBe(true);
    expect(isFeatureKey("store")).toBe(true);
    expect(isFeatureKey("orders")).toBe(false);
    expect(isFeatureKey("")).toBe(false);
  });
});

describe("evaluateFeatureAccess", () => {
  const NONE: ReadonlySet<string> = new Set();

  it("admins always pass, even when restricted and not allow-listed", () => {
    expect(
      evaluateFeatureAccess({ isAdmin: true, visibility: "restricted", userId: "u1", allowedUserIds: NONE }),
    ).toBe(true);
  });

  it("public features allow everyone, including guests", () => {
    expect(
      evaluateFeatureAccess({ isAdmin: false, visibility: "public", userId: null, allowedUserIds: NONE }),
    ).toBe(true);
  });

  it("restricted: a guest (no userId) is denied", () => {
    expect(
      evaluateFeatureAccess({ isAdmin: false, visibility: "restricted", userId: null, allowedUserIds: new Set(["u1"]) }),
    ).toBe(false);
  });

  it("restricted: an allow-listed user passes, a non-listed user is denied", () => {
    const allow = new Set(["u1", "u2"]);
    expect(
      evaluateFeatureAccess({ isAdmin: false, visibility: "restricted", userId: "u1", allowedUserIds: allow }),
    ).toBe(true);
    expect(
      evaluateFeatureAccess({ isAdmin: false, visibility: "restricted", userId: "u3", allowedUserIds: allow }),
    ).toBe(false);
  });
});
