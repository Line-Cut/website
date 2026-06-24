import { describe, it, expect } from "vitest";
import { parseCheckout } from "@/lib/stickers/checkout-schema";

const validPickup = {
  method: "pickup",
  firstName: "Nir",
  lastName: "Cohen",
  phone: "052123456",
  email: "nir@example.com",
};

const validShipping = {
  method: "shipping",
  firstName: "Nir",
  lastName: "Cohen",
  phone: "052123456",
  email: "nir@example.com",
  addressLine1: "HaSadna 8",
  city: "Holon",
  postalCode: "58100",
};

describe("parseCheckout", () => {
  it("valid pickup payload (no address) → success", () => {
    const result = parseCheckout(validPickup);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe("pickup");
    }
  });

  it("valid shipping payload (with address fields) → success", () => {
    const result = parseCheckout(validShipping);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe("shipping");
      expect(result.data.addressLine1).toBe("HaSadna 8");
    }
  });

  it("shipping missing addressLine1 → failure with errors.addressLine1 truthy", () => {
    const result = parseCheckout({
      ...validShipping,
      addressLine1: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.addressLine1).toBeTruthy();
    }
  });

  it("shipping missing city → failure with errors.city", () => {
    const result = parseCheckout({
      ...validShipping,
      city: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.city).toBeTruthy();
    }
  });

  it("shipping missing postalCode → failure with errors.postalCode", () => {
    const result = parseCheckout({
      ...validShipping,
      postalCode: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.postalCode).toBeTruthy();
    }
  });

  it("bad email → failure errors.email", () => {
    const result = parseCheckout({ ...validPickup, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.email).toBe("invalid_email");
    }
  });

  it("short phone → failure errors.phone", () => {
    const result = parseCheckout({ ...validPickup, phone: "123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.phone).toBe("invalid_phone");
    }
  });

  it("empty firstName → failure errors.firstName", () => {
    const result = parseCheckout({ ...validPickup, firstName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.firstName).toBe("required");
    }
  });

  it("empty lastName → failure errors.lastName", () => {
    const result = parseCheckout({ ...validPickup, lastName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.lastName).toBe("required");
    }
  });

  it("pickup without address fields → success (address not required)", () => {
    const result = parseCheckout({
      method: "pickup",
      firstName: "Test",
      lastName: "User",
      phone: "0501234567",
      email: "test@example.com",
      // no addressLine1, city, postalCode
    });
    expect(result.success).toBe(true);
  });

  it("optional fields (addressLine2, country, notes) accepted on pickup", () => {
    const result = parseCheckout({
      ...validPickup,
      addressLine2: "Apt 4",
      country: "IL",
      notes: "Leave at door",
    });
    expect(result.success).toBe(true);
  });
});
