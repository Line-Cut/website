import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    uploadFailed: "",
    retry: "Retry",
    empty: "No stickers yet.",
    networkOffline: "",
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
      notes: "Notes",
    },
    submit: "Place order",
    placing: "Placing…",
    back: "Back",
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
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPush.mockClear();
  vi.mocked(URL.createObjectURL).mockClear();
  vi.mocked(URL.revokeObjectURL).mockClear();
});

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

  it("clicking Continue calls router.push with /{lang}/stickers/checkout", () => {
    render(<StickerTool dict={dict} lang="en" />);

    // Add a file so Continue is enabled
    fireEvent.change(getFileInput(), { target: { files: [makeWebp()] } });

    // There may be multiple Continue buttons (mobile bar + panel). Click the first enabled one.
    const continueBtns = screen
      .getAllByText(dict.pricing.continue)
      .filter((el) => !(el as HTMLButtonElement).disabled);

    expect(continueBtns.length).toBeGreaterThan(0);
    fireEvent.click(continueBtns[0]);

    expect(mockPush).toHaveBeenCalledWith("/en/stickers/checkout");
  });
});
