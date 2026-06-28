import { describe, it, expect } from "vitest";
import { toCheckoutItems, toCheckoutCustomer } from "@/lib/store/checkout-payload";

describe("toCheckoutItems", () => {
  it("uses the locale title as description and keeps agorot unit prices", () => {
    const items = toCheckoutItems(
      [
        {
          productId: "p1",
          titleHe: "מדבקה",
          titleEn: "Sticker",
          imageUrl: null,
          options: [],
          quantity: 2,
          unitPrice: 1500,
          lineTotal: 3000,
        },
      ],
      "he",
    );
    expect(items).toEqual([
      { description: "מדבקה", catalogNumber: "p1", unitPrice: 1500, quantity: 2 },
    ]);
    expect(
      toCheckoutItems(
        [
          {
            productId: "p1",
            titleHe: "מדבקה",
            titleEn: "Sticker",
            imageUrl: null,
            options: [],
            quantity: 2,
            unitPrice: 1500,
            lineTotal: 3000,
          },
        ],
        "en",
      )[0].description,
    ).toBe("Sticker");
  });
});

describe("toCheckoutCustomer", () => {
  it("maps delivery fields", () => {
    expect(
      toCheckoutCustomer({
        method: "shipping",
        firstName: "A",
        lastName: "B",
        phone: "05",
        email: "a@b.c",
        addressLine1: "St 1",
        city: "TLV",
        postalCode: "61000",
      }),
    ).toEqual({
      firstName: "A",
      lastName: "B",
      email: "a@b.c",
      phone: "05",
      address: "St 1",
      city: "TLV",
      postalCode: "61000",
    });
  });
});
