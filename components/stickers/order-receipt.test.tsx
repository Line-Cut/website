import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderReceipt } from "@/components/stickers/order-receipt";
import type { OrderView } from "@/lib/stickers/types";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, src } = props as { alt: string; src: string };
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />;
  },
}));

const dict = {
  meta: { title: "", description: "" },
  steps: { build: "Build", details: "Details", confirm: "Confirm" },
  intro: { heading: "", subheading: "", lead: "" },
  upload: {
    dropPrompt: "",
    browse: "",
    mobileHint: "",
    accepted: "",
    limitHint: "",
    progress: "",
    addMore: "",
    countLabel: "",
    remaining: "",
  },
  errors: {
    notWebp: "",
    tooMany: "",
    tooBig: "",
    uploadFailed: "",
    retry: "",
    empty: "",
    networkOffline: "",
    serverError: "Something went wrong. Please try again.",
    notFound: "We couldn't find this order.",
    uploadsIncomplete: "Some files didn't finish uploading — please go back and try again.",
    paymentFailed: "Payment could not be processed.",
    noStickers: "This order has no stickers.",
  },
  thumb: { remove: "", removeLabel: "", failed: "" },
  preview: {
    heading: "",
    disclaimer: "",
    page: "",
    prev: "",
    next: "",
    perSheet: "",
  },
  pricing: {
    heading: "Your order",
    copies: "Copies",
    copiesHint: "",
    increase: "",
    decrease: "",
    uniqueCount: "Unique stickers",
    sheetsPerSet: "Sheets per set",
    totalSheets: "Total sheets",
    perSheetRate: "Rate",
    setupFee: "Setup",
    sheetsSubtotal: "Subtotal",
    total: "Total",
    pricePending: "Price TBD",
    continue: "Continue",
    uploading: "Uploading…",
  },
  checkout: {
    heading: "Delivery details",
    paymentNote: "No payment now",
    methodPickup: "Pickup in Holon",
    methodShipping: "Ship to address",
    fields: {
      firstName: "First name",
      lastName: "Last name",
      phone: "Phone",
      email: "Email",
      addressLine1: "Address",
      addressLine2: "Apt",
      city: "City",
      postalCode: "Postal code",
      country: "Country",
      notes: "Notes",
    },
    submit: "Place order",
    placing: "Placing…",
    back: "Back",
    noActiveOrder: "No active order found.",
    backToBuilder: "Back to sticker builder",
  },
  fieldErrors: { required: "Required", invalid_email: "Bad email", invalid_phone: "Bad phone" },
  receipt: {
    heading: "Order received",
    orderNumber: "Order #{id}",
    placedOn: "Placed on {date}",
    noPaymentYet: "No payment taken yet.",
    deliveryTo: "Shipping to",
    saveLink: "Save this link to track your order.",
    viewInAccount: "View in account",
    notFound: "Order not found.",
  },
  status: {
    heading: "Order status",
    received: "Received",
    in_production: "In Production",
    ready: "Ready",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
    current: "Current step",
  },
  account: {
    ordersHeading: "Your orders",
    empty: "No orders yet.",
    viewOrder: "View order",
    statusLabel: "Status",
    totalLabel: "Total",
  },
  email: {
    subjectReceived: "",
    greeting: "",
    bodyReceived: "",
    trackCta: "",
    signoff: "",
  },
};

const order: OrderView = {
  orderId: "order-abc-123",
  guestToken: "guest-xyz",
  status: "received",
  paymentStatus: "awaiting_payment",
  createdAtISO: "2026-06-20T10:00:00.000Z",
  copies: 2,
  breakdown: {
    uniqueCount: 3,
    copies: 2,
    perSheet: 15,
    perSheetRate: 1000,
    sheetsPerSet: 1,
    totalSheets: 2,
    sheetsSubtotal: 2000,
    setupFee: 500,
    total: 2500,
    currency: "ILS",
  },
  delivery: {
    method: "shipping",
    firstName: "Test",
    lastName: "User",
    phone: "0501234567",
    email: "test@example.com",
    addressLine1: "HaSadna 8",
    city: "Holon",
    postalCode: "58100",
    country: "Israel",
  },
};

describe("OrderReceipt", () => {
  it("renders the heading and no-payment notice", () => {
    render(<OrderReceipt order={order} dict={dict} locale="en" />);
    expect(
      screen.getByRole("heading", { name: dict.receipt.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.receipt.noPaymentYet)).toBeInTheDocument();
  });

  it("shows the order id", () => {
    render(<OrderReceipt order={order} dict={dict} locale="en" />);
    expect(screen.getByText(order.orderId)).toBeInTheDocument();
  });

  it("shows the save link prompt for guest orders", () => {
    render(<OrderReceipt order={order} dict={dict} locale="en" />);
    expect(screen.getByText(dict.receipt.saveLink)).toBeInTheDocument();
  });

  it("omits save link for logged-in orders (no guestToken)", () => {
    const { guestToken: _g, ...orderWithoutToken } = order;
    render(<OrderReceipt order={orderWithoutToken} dict={dict} locale="en" />);
    expect(screen.queryByText(dict.receipt.saveLink)).not.toBeInTheDocument();
  });
});
