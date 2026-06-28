import { describe, it, expect } from "vitest";
import { getIcreditConfig } from "@/lib/payments/icredit/config";

describe("getIcreditConfig", () => {
  it("defaults to mock when ICREDIT_MODE is unset", () => {
    expect(getIcreditConfig({})).toEqual({ mode: "mock", host: null, token: null });
  });
  it("resolves the test host and token", () => {
    expect(
      getIcreditConfig({ ICREDIT_MODE: "test", ICREDIT_GROUP_PRIVATE_TOKEN: "tok" }),
    ).toEqual({ mode: "test", host: "https://testicredit.rivhit.co.il", token: "tok" });
  });
  it("resolves the prod host", () => {
    expect(getIcreditConfig({ ICREDIT_MODE: "prod", ICREDIT_GROUP_PRIVATE_TOKEN: "p" }).host)
      .toBe("https://icredit.rivhit.co.il");
  });
  it("treats an unknown mode as mock", () => {
    expect(getIcreditConfig({ ICREDIT_MODE: "weird" }).mode).toBe("mock");
  });
});
