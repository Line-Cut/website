import { describe, it, expect } from "vitest";
import { parseContact } from "@/lib/contact-schema";

const valid = { name: "Dana", email: "dana@example.com", message: "I need 50 stickers please" };

describe("parseContact", () => {
  it("accepts valid input", () => {
    const r = parseContact(valid);
    expect(r.success).toBe(true);
  });
  it("rejects a bad email", () => {
    const r = parseContact({ ...valid, email: "nope" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.email).toBeTruthy();
  });
  it("rejects a short message", () => {
    const r = parseContact({ ...valid, message: "hi" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.message).toBeTruthy();
  });
  it("requires a name", () => {
    const r = parseContact({ ...valid, name: "" });
    expect(r.success).toBe(false);
  });
});
