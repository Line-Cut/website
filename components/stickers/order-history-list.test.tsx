import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderHistoryList } from "./order-history-list";
import type { OrderView } from "@/lib/stickers/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ---------------------------------------------------------------------------
// Test dict
// ---------------------------------------------------------------------------

const dict = {
  meta: { title: "", description: "" },
  steps: { build: "", details: "", confirm: "" },
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
    heading: "",
    copies: "",
    copiesHint: "",
    increase: "",
    decrease: "",
    uniqueCount: "",
    sheetsPerSet: "",
    totalSheets: "",
    perSheetRate: "",
    setupFee: "",
    sheetsSubtotal: "",
    total: "",
    pricePending: "",
    continue: "",
    uploading: "",
  },
  checkout: {
    heading: "",
    paymentNote: "",
    methodPickup: "",
    methodShipping: "",
    fields: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      postalCode: "",
      country: "",
      notes: "",
    },
    submit: "",
    placing: "",
    back: "",
    noActiveOrder: "",
    backToBuilder: "",
  },
  fieldErrors: { required: "", invalid_email: "", invalid_phone: "" },
  receipt: {
    heading: "",
    orderNumber: "",
    placedOn: "",
    noPaymentYet: "",
    deliveryTo: "",
    saveLink: "",
    viewInAccount: "",
    notFound: "",
  },
  status: {
    heading: "",
    received: "Received",
    in_production: "In production",
    ready: "Ready",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
    current: "Current step",
  },
  account: {
    ordersHeading: "Your orders",
    empty: "You have no orders yet.",
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
  builder: {
    saveDraft: "Save draft",
    savedToast: "Draft saved",
    loadError: "Couldn't load this draft. Please try again.",
  },
  drafts: {
    heading: "",
    empty: "",
    stickerCount: "",
    continueEditing: "",
    continueCheckout: "",
    discard: "",
    discardConfirm: "",
  },
} as const;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const makeOrder = (overrides: Partial<OrderView> = {}): OrderView => ({
  orderId: "order-abc-123",
  guestToken: "token-xyz",
  status: "received",
  paymentStatus: "awaiting_payment",
  createdAtISO: "2024-01-15T10:00:00Z",
  copies: 2,
  breakdown: {
    perSheet: 15,
    sheetsPerSet: 1,
    totalSheets: 2,
    perSheetRate: 500,
    setupFee: 1000,
    sheetsSubtotal: 1000,
    total: 2000,
    currency: "ILS",
    uniqueCount: 10,
    copies: 2,
  },
  delivery: {
    method: "pickup",
    firstName: "Test",
    lastName: "User",
    phone: "0501234567",
    email: "test@example.com",
  },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OrderHistoryList", () => {
  it("renders the empty-state message when orders array is empty", () => {
    render(
      <OrderHistoryList orders={[]} dict={dict} locale="en" lang="en" />,
    );
    expect(screen.getByText(dict.account.empty)).toBeInTheDocument();
  });

  it("renders a list item for each order", () => {
    const orders = [makeOrder(), makeOrder({ orderId: "order-def-456", guestToken: "token-def" })];
    render(
      <OrderHistoryList orders={orders} dict={dict} locale="en" lang="en" />,
    );
    // Two list items
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders status badge with the correct label", () => {
    render(
      <OrderHistoryList
        orders={[makeOrder({ status: "in_production" })]}
        dict={dict}
        locale="en"
        lang="en"
      />,
    );
    expect(screen.getByText(dict.status.in_production)).toBeInTheDocument();
  });

  it("renders a view-order link pointing to the track route", () => {
    render(
      <OrderHistoryList
        orders={[makeOrder()]}
        dict={dict}
        locale="en"
        lang="en"
      />,
    );
    const link = screen.getByRole("link", { name: dict.account.viewOrder });
    expect(link).toHaveAttribute("href", "/en/stickers/track/token-xyz");
  });

  it("does not render a view link when guestToken is absent", () => {
    render(
      <OrderHistoryList
        orders={[makeOrder({ guestToken: undefined })]}
        dict={dict}
        locale="en"
        lang="en"
      />,
    );
    expect(
      screen.queryByRole("link", { name: dict.account.viewOrder }),
    ).toBeNull();
  });

  it("renders statusLabel and totalLabel headings", () => {
    render(
      <OrderHistoryList
        orders={[makeOrder()]}
        dict={dict}
        locale="en"
        lang="en"
      />,
    );
    expect(screen.getByText(dict.account.statusLabel)).toBeInTheDocument();
    expect(screen.getByText(dict.account.totalLabel)).toBeInTheDocument();
  });
});
