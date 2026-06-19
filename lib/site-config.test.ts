import { describe, it, expect } from "vitest";
import { siteConfig, whatsappLink } from "@/lib/site-config";

describe("siteConfig", () => {
  it("carries known business facts", () => {
    expect(siteConfig.businessId).toBe("516741998");
    expect(siteConfig.address.city).toBe("Holon");
  });
});

describe("whatsappLink", () => {
  it("builds a wa.me link with encoded message", () => {
    const link = whatsappLink("hello world");
    expect(link).toContain("https://wa.me/");
    expect(link).toContain("text=hello%20world");
  });
});
