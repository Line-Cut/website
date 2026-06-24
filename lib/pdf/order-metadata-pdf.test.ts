import { describe, it, expect } from "vitest";
import { buildOrderMetadataPdf } from "./order-metadata-pdf";

function pdfHeader(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.slice(0, 5));
}

describe("buildOrderMetadataPdf", () => {
  it("renders a non-empty PDF for a Hebrew shipping order without throwing", async () => {
    const bytes = await buildOrderMetadataPdf({
      orderId: "11111111-2222-3333-4444-555555555555",
      delivery: {
        method: "shipping",
        firstName: "דוד",
        lastName: "כהן",
        phone: "+972-50-123-4567",
        email: "david@example.com",
        addressLine1: "רחוב הרצל 12",
        city: "תל אביב",
        postalCode: "61000",
        country: "ישראל",
        notes: "להשאיר ליד הדלת",
      },
      copies: 2,
      stickerCount: 5,
      createdAtISO: "2026-06-24T10:00:00.000Z",
    });

    expect(pdfHeader(bytes)).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("renders a Latin pickup order", async () => {
    const bytes = await buildOrderMetadataPdf({
      orderId: "ord-2",
      delivery: {
        method: "pickup",
        firstName: "Dana",
        lastName: "Levi",
        phone: "0501112222",
        email: "dana@example.com",
      },
      copies: 1,
      stickerCount: 1,
      createdAtISO: "2026-06-24T10:00:00.000Z",
    });

    expect(pdfHeader(bytes)).toBe("%PDF-");
  });
});
