import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StickerTool } from "@/components/stickers/sticker-tool";

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

// Mock the server action
const mockCreateOrderDraft = vi.fn();
vi.mock("@/app/actions/stickers", () => ({
  createOrderDraft: (...args: unknown[]) => mockCreateOrderDraft(...args),
  confirmOrder: vi.fn(),
}));

// Mock the upload client
const mockUploadFiles = vi.fn();
vi.mock("@/lib/stickers/upload-client", () => ({
  uploadFiles: (...args: unknown[]) => mockUploadFiles(...args),
  putToPresignedUrl: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Shared test dict (minimal but valid shape)
// ---------------------------------------------------------------------------

const dict = {
  meta: { title: "Order Stickers", description: "" },
  steps: { build: "Build", details: "Details", confirm: "Confirm" },
  intro: {
    heading: "Order stickers",
    subheading: "Upload your files",
    lead: "WebP stickers printed on A4 sheets.",
  },
  upload: {
    dropPrompt: "Drag stickers here, or",
    browse: "browse files",
    mobileHint: "Tap to open",
    accepted: "WebP images only",
    limitHint: "Up to {max} stickers",
    progress: "",
    addMore: "Add more",
    countLabel: "{count} / {max} stickers",
    remaining: "",
  },
  errors: {
    notWebp: "Only WebP files are accepted. {name} was skipped.",
    tooMany: "You can upload up to {max} stickers. Extra files were skipped.",
    tooBig: "{name} is larger than {limit} and was skipped.",
    uploadFailed: "Upload failed. Please try again.",
    retry: "Retry",
    empty: "No stickers yet.",
    networkOffline: "",
    serverError: "Something went wrong. Please try again.",
    notFound: "We couldn't find this order.",
    uploadsIncomplete: "Some files didn't finish uploading — please go back and try again.",
    paymentFailed: "Payment could not be processed.",
    noStickers: "This order has no stickers.",
  },
  thumb: { remove: "Remove", removeLabel: "Remove {name}", failed: "Failed" },
  preview: {
    heading: "Sheet preview",
    disclaimer: "Preview only.",
    page: "Sheet {current} of {total}",
    prev: "Previous sheet",
    next: "Next sheet",
    perSheet: "{n} stickers per A4 sheet",
  },
  pricing: {
    heading: "Your order",
    copies: "Copies",
    copiesHint: "Each copy prints every sticker once.",
    increase: "Increase copies",
    decrease: "Decrease copies",
    uniqueCount: "Unique stickers",
    sheetsPerSet: "Sheets per set",
    totalSheets: "Total A4 sheets",
    perSheetRate: "Price per sheet",
    setupFee: "Setup fee",
    sheetsSubtotal: "Sheets subtotal",
    total: "Total",
    pricePending: "Price confirmed before printing.",
    continue: "Continue to payment",
    uploading: "Uploading…",
  },
  checkout: {
    heading: "Delivery details",
    paymentNote: "",
    methodPickup: "Pickup",
    methodShipping: "Shipping",
    fields: {
      fullName: "Full name",
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
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebp(name = "sticker.webp", bytes = 1024) {
  return new File([new Uint8Array(bytes)], name, { type: "image/webp" });
}

/** Grab the hidden file input inside the uploader */
function getFileInput() {
  return screen.getByLabelText(dict.upload.browse) as HTMLInputElement;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPush.mockClear();
  mockCreateOrderDraft.mockClear();
  mockUploadFiles.mockClear();
  vi.mocked(URL.createObjectURL).mockClear();
  vi.mocked(URL.revokeObjectURL).mockClear();

  // Default: successful draft + upload
  mockCreateOrderDraft.mockResolvedValue({
    ok: true,
    orderId: "o1",
    guestToken: "gt",
    uploads: [{ stickerId: "s1", key: "k", url: "https://up/1" }],
  });

  mockUploadFiles.mockImplementation(
    (
      _pairs: unknown[],
      opts?: { onEach?: (i: number, status: "done" | "error") => void },
    ) => {
      opts?.onEach?.(0, "done");
      return Promise.resolve([{ index: 0, ok: true }]);
    },
  );
});

// ---------------------------------------------------------------------------
// Tests — existing (kept intact)
// ---------------------------------------------------------------------------

describe("StickerTool", () => {
  it("initial render: uploader visible, no grid/preview, Build step is current", () => {
    render(<StickerTool dict={dict} lang="en" />);

    // Uploader is visible
    expect(screen.getByLabelText(dict.upload.browse)).toBeInTheDocument();

    // No grid count label (grid only appears when items > 0)
    expect(screen.queryByText(/0 \/ 200 stickers/)).not.toBeInTheDocument();

    // No preview disclaimer (A4Preview only appears when srcs.length > 0)
    expect(screen.queryByText(dict.preview.disclaimer)).not.toBeInTheDocument();

    // Step indicator: "Build" has aria-current="step"
    const buildStep = screen.getByText(dict.steps.build);
    // Traverse up to the <li> which carries aria-current
    const li = buildStep.closest("li");
    expect(li).toHaveAttribute("aria-current", "step");

    // Other steps do not have aria-current
    const detailsLi = screen.getByText(dict.steps.details).closest("li");
    expect(detailsLi).not.toHaveAttribute("aria-current");
  });

  it("adding a file shows grid thumbnail, count updates, and preview appears", () => {
    render(<StickerTool dict={dict} lang="en" />);

    const file = makeWebp("my-sticker.webp");
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    // Count label from UploadedGrid (may appear in mobile bar too — just check at least one exists)
    // Anchored regex guards against the doubled-count regression "1 1 / 200 stickers"
    expect(screen.getAllByText(/^1 \/ 200 stickers$/).length).toBeGreaterThan(0);

    // Preview disclaimer (A4Preview renders when srcs.length > 0)
    expect(screen.getByText(dict.preview.disclaimer)).toBeInTheDocument();

    // Order summary heading appears
    expect(screen.getAllByText(dict.pricing.heading).length).toBeGreaterThan(0);

    // URL.createObjectURL called for the file
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
  });

  it("removing an item revokes its object URL and returns to empty state", () => {
    render(<StickerTool dict={dict} lang="en" />);

    const file = makeWebp("to-remove.webp");
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    // The grid count label should be present (may appear in multiple places)
    // Anchored regex guards against the doubled-count regression "1 1 / 200 stickers"
    expect(screen.getAllByText(/^1 \/ 200 stickers$/).length).toBeGreaterThan(0);

    // Click the remove button for the sticker
    const removeBtn = screen.getByLabelText(/Remove to-remove\.webp/i);
    fireEvent.click(removeBtn);

    // Grid and preview are gone
    expect(screen.queryAllByText(/^1 \/ 200 stickers$/)).toHaveLength(0);
    expect(screen.queryByText(dict.preview.disclaimer)).not.toBeInTheDocument();

    // revokeObjectURL was called
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Tests — upload flow (new for Task 16)
  // ---------------------------------------------------------------------------

  it("Continue with 1 file: calls createOrderDraft, uploadFiles, sets sessionStorage, pushes to checkout", async () => {
    render(<StickerTool dict={dict} lang="en" />);

    // Add a file
    fireEvent.change(getFileInput(), { target: { files: [makeWebp("a.webp")] } });

    // Click Continue (use the desktop panel button — it's always rendered when hasItems)
    const continueBtns = screen
      .getAllByText(dict.pricing.continue)
      .filter((el) => !(el as HTMLButtonElement).disabled);
    expect(continueBtns.length).toBeGreaterThan(0);
    fireEvent.click(continueBtns[0]);

    // Wait for the async flow to complete
    await waitFor(() => {
      expect(mockCreateOrderDraft).toHaveBeenCalledTimes(1);
    });

    // createOrderDraft called with stickers.length === 1 and copies === 1
    const callArg = mockCreateOrderDraft.mock.calls[0][0] as {
      stickers: { filename: string; bytes: number; contentType: string; width: number; height: number }[];
      copies: number;
    };
    expect(callArg.stickers).toHaveLength(1);
    expect(callArg.stickers[0].filename).toBe("a.webp");
    expect(callArg.copies).toBe(1);

    // uploadFiles was called
    await waitFor(() => {
      expect(mockUploadFiles).toHaveBeenCalledTimes(1);
    });

    // sessionStorage was set with the order handle
    await waitFor(() => {
      const stored = sessionStorage.getItem("linecut_order");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed).toEqual({ orderId: "o1", guestToken: "gt" });
    });

    // router.push called with the checkout URL
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/en/stickers/checkout");
    });
  });

  it("createOrderDraft returning ok:false surfaces an error and does NOT navigate", async () => {
    mockCreateOrderDraft.mockResolvedValueOnce({
      ok: false,
      message: "db_error",
    });

    render(<StickerTool dict={dict} lang="en" />);
    fireEvent.change(getFileInput(), { target: { files: [makeWebp()] } });

    const continueBtns = screen
      .getAllByText(dict.pricing.continue)
      .filter((el) => !(el as HTMLButtonElement).disabled);
    fireEvent.click(continueBtns[0]);

    // Error message should appear in an aria-live region with the localized text (not the raw code)
    await waitFor(() => {
      // There may be multiple role="alert" elements (e.g. StickerUploader also has one);
      // find the one that carries the localized error text.
      const alerts = screen.getAllByRole("alert");
      const errorAlert = alerts.find((el) =>
        el.textContent?.includes(dict.errors.serverError),
      );
      expect(errorAlert).toBeTruthy();
    });

    // Raw server code must NOT be rendered
    expect(screen.queryByText("db_error")).toBeNull();

    // router.push must NOT have been called
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("legacy test: clicking Continue (mocked flow) calls router.push with /{lang}/stickers/checkout", async () => {
    render(<StickerTool dict={dict} lang="en" />);

    // Add a file so Continue is enabled
    fireEvent.change(getFileInput(), { target: { files: [makeWebp()] } });

    // There may be multiple Continue buttons (mobile bar + panel). Click the first enabled one.
    const continueBtns = screen
      .getAllByText(dict.pricing.continue)
      .filter((el) => !(el as HTMLButtonElement).disabled);

    expect(continueBtns.length).toBeGreaterThan(0);
    fireEvent.click(continueBtns[0]);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/en/stickers/checkout");
    });
  });
});
