import { describe, it, expect } from "vitest";
import { buildOwnerOrderEmail } from "@/lib/emails/order-notification";
import type { OwnerOrderEmailInput } from "@/lib/emails/order-notification";
import { formatMoney } from "@/lib/stickers/format";
import type { PriceBreakdown } from "@/lib/stickers/pricing";

const breakdown: PriceBreakdown = {
  uniqueCount: 3,
  copies: 2,
  perSheet: 15,
  perSheetRate: 500,
  sheetsPerSet: 1,
  totalSheets: 2,
  sheetsSubtotal: 1000,
  setupFee: 200,
  total: 1200,
  currency: "ILS",
};

const baseInput: OwnerOrderEmailInput = {
  orderId: "11111111-2222-3333-4444-555555556789",
  ownerFilesUrl: "https://linecut.example/he/admin/orders/11111111-2222-3333-4444-555555556789/files",
  contactName: "Dana Cohen",
  contactEmail: "dana@example.com",
  contactPhone: "+972-50-123-4567",
  delivery: {
    method: "pickup",
    fullName: "Dana Cohen",
    phone: "+972-50-123-4567",
    email: "dana@example.com",
  },
  copies: 2,
  stickerCount: 3,
  breakdown,
  locale: "en",
};

describe("buildOwnerOrderEmail", () => {
  it("subject contains a short (8-char) uppercase order id fragment", () => {
    const { subject } = buildOwnerOrderEmail(baseInput);
    // Last 8 hex chars of "11111111222233334444555555556789" → "55556789" → uppercase
    expect(subject).toContain("55556789");
    expect(subject).toMatch(/Line Cut/i);
  });

  it("text contains the customer name", () => {
    const { text } = buildOwnerOrderEmail(baseInput);
    expect(text).toContain("Dana Cohen");
  });

  it("text contains the total formatted as money", () => {
    const { text } = buildOwnerOrderEmail(baseInput);
    const formatted = formatMoney(breakdown.total, breakdown.currency, "en");
    expect(text).toContain(formatted);
  });

  it("text contains the sticker count", () => {
    const { text } = buildOwnerOrderEmail(baseInput);
    expect(text).toContain("3");
  });

  it("text contains the ownerFilesUrl", () => {
    const { text } = buildOwnerOrderEmail(baseInput);
    expect(text).toContain(baseInput.ownerFilesUrl);
  });

  it("replyTo equals contactEmail", () => {
    const { replyTo } = buildOwnerOrderEmail(baseInput);
    expect(replyTo).toBe("dana@example.com");
  });

  it("includes shipping address fields when method is shipping", () => {
    const input: OwnerOrderEmailInput = {
      ...baseInput,
      delivery: {
        method: "shipping",
        fullName: "Dana Cohen",
        phone: "+972-50-123-4567",
        email: "dana@example.com",
        addressLine1: "123 Herzl St",
        city: "Tel Aviv",
        postalCode: "61000",
        country: "Israel",
      },
    };
    const { text } = buildOwnerOrderEmail(input);
    expect(text).toContain("123 Herzl St");
    expect(text).toContain("Tel Aviv");
    expect(text).toContain("61000");
  });

  it("does NOT include address fields for pickup delivery", () => {
    const { text } = buildOwnerOrderEmail(baseInput);
    // These strings only appear in the address block
    expect(text).not.toContain("Address:");
    expect(text).not.toContain("City:");
  });

  it("includes phone when provided", () => {
    const { text } = buildOwnerOrderEmail(baseInput);
    expect(text).toContain("+972-50-123-4567");
  });

  it("shows dash for phone when null", () => {
    const input = { ...baseInput, contactPhone: null };
    const { text } = buildOwnerOrderEmail(input);
    expect(text).toContain("Phone:         -");
  });
});
