import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CheckoutForm } from "@/components/stickers/checkout-form";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

const mockConfirmOrder = vi.fn();
vi.mock("@/app/actions/stickers", () => ({
  createOrderDraft: vi.fn(),
  confirmOrder: (...args: unknown[]) => mockConfirmOrder(...args),
}));

// ---------------------------------------------------------------------------
// Test dict
// ---------------------------------------------------------------------------

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
    heading: "Delivery details",
    paymentNote: "No payment is taken now.",
    methodPickup: "Pickup in Holon",
    methodShipping: "Ship to my address",
    fields: {
      firstName: "First name",
      lastName: "Last name",
      phone: "Phone",
      email: "Email",
      addressLine1: "Address",
      addressLine2: "Apartment (optional)",
      city: "City",
      postalCode: "Postal code",
      country: "Country",
      notes: "Order notes (optional)",
    },
    submit: "Place order",
    placing: "Placing order…",
    back: "Back to editor",
    noActiveOrder: "No active order found.",
    backToBuilder: "Back to sticker builder",
  },
  fieldErrors: {
    required: "Required",
    invalid_email: "Invalid email",
    invalid_phone: "Invalid phone number",
  },
  receipt: {
    heading: "",
    orderNumber: "",
    placedOn: "",
    noPaymentYet: "",
    deliveryTo: "",
    saveLink: "",
    viewInAccount: "",
    notFound: "Order not found.",
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
  account: {
    ordersHeading: "",
    empty: "",
    viewOrder: "",
    statusLabel: "",
    totalLabel: "",
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
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_HANDLE = JSON.stringify({ orderId: "order-1", guestToken: "gt-1" });

function setOrderHandle(value: string | null) {
  if (value === null) {
    sessionStorage.removeItem("linecut_order");
  } else {
    sessionStorage.setItem("linecut_order", value);
  }
}

function fillPickupForm() {
  fireEvent.change(screen.getByLabelText(dict.checkout.fields.firstName), {
    target: { value: "Test" },
  });
  fireEvent.change(screen.getByLabelText(dict.checkout.fields.lastName), {
    target: { value: "User" },
  });
  fireEvent.change(screen.getByLabelText(dict.checkout.fields.phone), {
    target: { value: "0501234567" },
  });
  fireEvent.change(screen.getByLabelText(dict.checkout.fields.email), {
    target: { value: "test@example.com" },
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPush.mockClear();
  mockConfirmOrder.mockClear();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CheckoutForm", () => {
  it("renders no-active-order notice + back link when sessionStorage is empty", async () => {
    setOrderHandle(null);

    render(<CheckoutForm dict={dict} lang="en" />);

    // Wait for the useEffect to run and update state
    await waitFor(() => {
      expect(
        screen.getByText(dict.checkout.noActiveOrder),
      ).toBeInTheDocument();
    });

    // Back link is visible
    expect(
      screen.getByRole("link", { name: dict.checkout.backToBuilder }),
    ).toBeInTheDocument();

    // No form rendered
    expect(
      screen.queryByRole("form") ??
      screen.queryByLabelText(dict.checkout.fields.firstName),
    ).toBeNull();
  });

  it("renders the checkout form when a valid handle is in sessionStorage", async () => {
    setOrderHandle(VALID_HANDLE);

    render(<CheckoutForm dict={dict} lang="en" />);

    await waitFor(() => {
      expect(
        screen.getByLabelText(dict.checkout.fields.firstName),
      ).toBeInTheDocument();
    });

    // Payment note is shown
    expect(screen.getByText(dict.checkout.paymentNote)).toBeInTheDocument();

    // Submit button is visible
    expect(
      screen.getByRole("button", { name: dict.checkout.submit }),
    ).toBeInTheDocument();
  });

  it("shows inline error for city when shipping method is selected but city is empty on submit; confirmOrder NOT called", async () => {
    setOrderHandle(VALID_HANDLE);

    render(<CheckoutForm dict={dict} lang="en" />);

    await waitFor(() => {
      expect(
        screen.getByLabelText(dict.checkout.fields.firstName),
      ).toBeInTheDocument();
    });

    // Switch to shipping
    fireEvent.click(screen.getByLabelText(dict.checkout.methodShipping));

    // Fill required pickup fields but leave city empty
    fireEvent.change(screen.getByLabelText(dict.checkout.fields.firstName), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(dict.checkout.fields.lastName), {
      target: { value: "User" },
    });
    fireEvent.change(screen.getByLabelText(dict.checkout.fields.phone), {
      target: { value: "0501234567" },
    });
    fireEvent.change(screen.getByLabelText(dict.checkout.fields.email), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText(dict.checkout.fields.addressLine1), {
      target: { value: "HaSadna 8" },
    });
    fireEvent.change(screen.getByLabelText(dict.checkout.fields.postalCode), {
      target: { value: "58100" },
    });
    // city is intentionally left empty

    // Submit
    fireEvent.submit(screen.getByRole("button", { name: dict.checkout.submit }).closest("form")!);

    // Inline error for city shown
    await waitFor(() => {
      // "Required" is the dict.fieldErrors.required mapped from "required"
      expect(screen.getByText(dict.fieldErrors.required)).toBeInTheDocument();
    });

    // confirmOrder must NOT have been called
    expect(mockConfirmOrder).not.toHaveBeenCalled();
  });

  it("valid pickup submit: calls confirmOrder with correct args; on ok:true clears sessionStorage + navigates", async () => {
    setOrderHandle(VALID_HANDLE);

    mockConfirmOrder.mockResolvedValueOnce({
      ok: true,
      orderId: "order-1",
      guestToken: "gt-1",
    });

    render(<CheckoutForm dict={dict} lang="en" />);

    await waitFor(() => {
      expect(
        screen.getByLabelText(dict.checkout.fields.firstName),
      ).toBeInTheDocument();
    });

    // Method is pickup by default — just fill contact fields
    fillPickupForm();

    // Submit
    fireEvent.submit(screen.getByRole("button", { name: dict.checkout.submit }).closest("form")!);

    await waitFor(() => {
      expect(mockConfirmOrder).toHaveBeenCalledTimes(1);
    });

    // Verify call args
    const callArg = mockConfirmOrder.mock.calls[0][0] as {
      orderId: string;
      guestToken: string;
      delivery: Record<string, unknown>;
    };
    expect(callArg.orderId).toBe("order-1");
    expect(callArg.guestToken).toBe("gt-1");
    expect(callArg.delivery).toMatchObject({
      method: "pickup",
      firstName: "Test",
      lastName: "User",
      phone: "0501234567",
      email: "test@example.com",
    });

    // sessionStorage cleared
    await waitFor(() => {
      expect(sessionStorage.getItem("linecut_order")).toBeNull();
    });

    // router.push to track URL
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/en/stickers/track/gt-1");
    });
  });

  it("server ok:false with message 'not_found' → shows localized notFound text, NOT the raw code", async () => {
    setOrderHandle(VALID_HANDLE);

    mockConfirmOrder.mockResolvedValueOnce({
      ok: false,
      message: "not_found",
    });

    render(<CheckoutForm dict={dict} lang="en" />);

    await waitFor(() => {
      expect(
        screen.getByLabelText(dict.checkout.fields.firstName),
      ).toBeInTheDocument();
    });

    fillPickupForm();

    fireEvent.submit(screen.getByRole("button", { name: dict.checkout.submit }).closest("form")!);

    // Localized message is shown
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(dict.errors.notFound)).toBeInTheDocument();
    });

    // Raw server code must NOT be rendered
    expect(screen.queryByText("not_found")).toBeNull();

    // No navigation
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("server ok:false with message 'payment_failed' → shows localized paymentFailed text, NOT the raw code", async () => {
    setOrderHandle(VALID_HANDLE);

    mockConfirmOrder.mockResolvedValueOnce({
      ok: false,
      message: "payment_failed",
    });

    render(<CheckoutForm dict={dict} lang="en" />);

    await waitFor(() => {
      expect(
        screen.getByLabelText(dict.checkout.fields.firstName),
      ).toBeInTheDocument();
    });

    fillPickupForm();

    fireEvent.submit(screen.getByRole("button", { name: dict.checkout.submit }).closest("form")!);

    // Localized message is shown
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(dict.errors.paymentFailed)).toBeInTheDocument();
    });

    // Raw server code must NOT be rendered
    expect(screen.queryByText("payment_failed")).toBeNull();

    // No navigation
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("server ok:false with errors → shows field-level error for the returned field", async () => {
    setOrderHandle(VALID_HANDLE);

    mockConfirmOrder.mockResolvedValueOnce({
      ok: false,
      errors: { firstName: "required" },
    });

    render(<CheckoutForm dict={dict} lang="en" />);

    await waitFor(() => {
      expect(
        screen.getByLabelText(dict.checkout.fields.firstName),
      ).toBeInTheDocument();
    });

    fillPickupForm();

    fireEvent.submit(
      screen.getByRole("button", { name: dict.checkout.submit }).closest("form")!,
    );

    // Field-level error for firstName is shown (mapped via fieldErrors dict)
    await waitFor(() => {
      expect(screen.getByText(dict.fieldErrors.required)).toBeInTheDocument();
    });

    // No navigation
    expect(mockPush).not.toHaveBeenCalled();
  });
});
