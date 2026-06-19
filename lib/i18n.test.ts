import { describe, it, expect } from "vitest";
import { getLocale, isLocale } from "@/lib/i18n";

describe("getLocale", () => {
  it("defaults to he when header missing", () => {
    expect(getLocale(null)).toBe("he");
  });
  it("returns en when English is preferred", () => {
    expect(getLocale("en-US,en;q=0.9")).toBe("en");
  });
  it("returns he for Hebrew header", () => {
    expect(getLocale("he-IL,he;q=0.9")).toBe("he");
  });
  it("maps legacy 'iw' to he", () => {
    expect(getLocale("iw")).toBe("he");
  });
  it("falls back to he for unsupported languages", () => {
    expect(getLocale("fr-FR,fr;q=0.8")).toBe("he");
  });
  it("respects q-value ordering", () => {
    expect(getLocale("fr;q=0.9,en;q=0.95")).toBe("en");
  });
});

describe("isLocale", () => {
  it("accepts supported locales", () => {
    expect(isLocale("he")).toBe(true);
    expect(isLocale("en")).toBe(true);
  });
  it("rejects others", () => {
    expect(isLocale("de")).toBe(false);
  });
});
