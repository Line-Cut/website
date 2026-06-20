import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrderSummaryPanel } from "@/components/stickers/order-summary-panel";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, src } = props as { alt: string; src: string };
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />;
  },
}));

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
  preview: { heading: "", disclaimer: "", page: "", prev: "", next: "", perSheet: "" },
  pricing: {
    heading: "Your order",
    copies: "Copies (full sets)",
    copiesHint: "Each copy prints all stickers once.",
    increase: "Increase copies",
    decrease: "Decrease copies",
    uniqueCount: "Unique stickers",
    sheetsPerSet: "Sheets per set",
    totalSheets: "Total A4 sheets",
    perSheetRate: "Rate per sheet",
    setupFee: "One-time setup",
    sheetsSubtotal: "Sheets subtotal",
    total: "Total",
    pricePending: "Final price confirmed before printing.",
    continue: "Continue to checkout",
    uploading: "Uploading…",
  },
  checkout: {
    heading: "",
    paymentNote: "",
    methodPickup: "",
    methodShipping: "",
    fields: {
      fullName: "",
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
    received: "",
    in_production: "",
    ready: "",
    shipped: "",
    delivered: "",
    cancelled: "",
    current: "",
  },
  account: { ordersHeading: "", empty: "", viewOrder: "", statusLabel: "", totalLabel: "" },
  email: { subjectReceived: "", greeting: "", bodyReceived: "", trackCta: "", signoff: "" },
};

describe("OrderSummaryPanel", () => {
  it("disables the continue button when uniqueCount is 0", () => {
    render(
      <OrderSummaryPanel
        uniqueCount={0}
        copies={1}
        onCopiesChange={vi.fn()}
        dict={dict}
        locale="en"
      />,
    );
    const btn = screen.getByRole("button", { name: dict.pricing.continue });
    expect(btn).toBeDisabled();
  });

  it("enables the continue button when uniqueCount > 0", () => {
    render(
      <OrderSummaryPanel
        uniqueCount={3}
        copies={1}
        onCopiesChange={vi.fn()}
        dict={dict}
        locale="en"
      />,
    );
    const btn = screen.getByRole("button", { name: dict.pricing.continue });
    expect(btn).not.toBeDisabled();
  });

  it("calls onContinue when the continue button is clicked and uniqueCount > 0", () => {
    const onContinue = vi.fn();
    render(
      <OrderSummaryPanel
        uniqueCount={3}
        copies={1}
        onCopiesChange={vi.fn()}
        dict={dict}
        locale="en"
        onContinue={onContinue}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: dict.pricing.continue }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("changing copies via the stepper calls onCopiesChange", () => {
    const onCopiesChange = vi.fn();
    render(
      <OrderSummaryPanel
        uniqueCount={3}
        copies={2}
        onCopiesChange={onCopiesChange}
        dict={dict}
        locale="en"
      />,
    );
    fireEvent.click(screen.getByLabelText(dict.pricing.increase));
    expect(onCopiesChange).toHaveBeenCalledWith(3);
  });

  it("respects continueDisabled override even when uniqueCount > 0", () => {
    render(
      <OrderSummaryPanel
        uniqueCount={3}
        copies={1}
        onCopiesChange={vi.fn()}
        dict={dict}
        locale="en"
        continueDisabled
      />,
    );
    expect(screen.getByRole("button", { name: dict.pricing.continue })).toBeDisabled();
  });

  it("renders the heading", () => {
    render(
      <OrderSummaryPanel
        uniqueCount={0}
        copies={1}
        onCopiesChange={vi.fn()}
        dict={dict}
        locale="en"
      />,
    );
    expect(screen.getByText(dict.pricing.heading)).toBeInTheDocument();
  });

  it("has an aria-live region for price changes", () => {
    const { container } = render(
      <OrderSummaryPanel
        uniqueCount={3}
        copies={1}
        onCopiesChange={vi.fn()}
        dict={dict}
        locale="en"
      />,
    );
    expect(container.querySelector("[aria-live]")).toBeInTheDocument();
  });
});
