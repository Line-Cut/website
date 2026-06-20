import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StickerUploader } from "@/components/stickers/sticker-uploader";

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
    dropPrompt: "Drag stickers here, or",
    browse: "browse files",
    mobileHint: "Tap to open",
    accepted: "WebP images only",
    limitHint: "Up to {max} stickers",
    progress: "",
    addMore: "",
    countLabel: "{count} / {max} stickers",
    remaining: "",
  },
  errors: {
    notWebp: "Only WebP files are accepted. {name} was skipped.",
    tooMany: "You can upload up to {max} stickers. Extra files were skipped.",
    tooBig: "{name} is larger than {limit} and was skipped.",
    uploadFailed: "",
    retry: "Retry",
    empty: "",
    networkOffline: "",
  },
  thumb: { remove: "Remove", removeLabel: "Remove {name}", failed: "Failed" },
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
      notes: "",
    },
    submit: "",
    placing: "",
    back: "",
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
};

function makeWebp(name = "a.webp", bytes = 1024) {
  return new File([new Uint8Array(bytes)], name, { type: "image/webp" });
}

function makePng(name = "b.png") {
  return new File([new Uint8Array(512)], name, { type: "image/png" });
}

function getInput() {
  return screen.getByLabelText(dict.upload.browse) as HTMLInputElement;
}

describe("StickerUploader", () => {
  it("selecting a valid webp file fires onAdd with that file", () => {
    const onAdd = vi.fn();
    render(<StickerUploader existingCount={0} dict={dict} onAdd={onAdd} />);
    const file = makeWebp();
    fireEvent.change(getInput(), { target: { files: [file] } });
    expect(onAdd).toHaveBeenCalledWith([file]);
  });

  it("selecting a non-webp file shows a reject message and calls onAdd with empty", () => {
    const onAdd = vi.fn();
    render(<StickerUploader existingCount={0} dict={dict} onAdd={onAdd} />);
    const file = makePng("photo.png");
    fireEvent.change(getInput(), { target: { files: [file] } });
    expect(
      screen.getByRole("alert").textContent,
    ).toContain("photo.png");
    expect(onAdd).toHaveBeenCalledWith([]);
  });

  it("non-webp reject message text matches the error template", () => {
    const onAdd = vi.fn();
    render(<StickerUploader existingCount={0} dict={dict} onAdd={onAdd} />);
    fireEvent.change(getInput(), { target: { files: [makePng("x.png")] } });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("x.png");
    expect(alert.textContent).toContain("WebP");
  });

  it("selecting beyond max surfaces the tooMany message", () => {
    const onAdd = vi.fn();
    // existingCount = 200 means cap is already hit
    render(
      <StickerUploader existingCount={200} dict={dict} onAdd={onAdd} />,
    );
    const file = makeWebp("extra.webp");
    fireEvent.change(getInput(), { target: { files: [file] } });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("200");
  });

  it("selecting files when one valid + one pushes over limit: valid accepted, excess gives tooMany", () => {
    const onAdd = vi.fn();
    // existingCount = 199 → one slot left
    render(
      <StickerUploader existingCount={199} dict={dict} onAdd={onAdd} />,
    );
    const first = makeWebp("first.webp");
    const second = makeWebp("second.webp");
    fireEvent.change(getInput(), { target: { files: [first, second] } });
    // first accepted, second → overLimit
    expect(onAdd).toHaveBeenCalledWith([first]);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("200");
  });

  it("renders the drop prompt and browse text", () => {
    render(<StickerUploader existingCount={0} dict={dict} onAdd={vi.fn()} />);
    expect(screen.getByText(dict.upload.dropPrompt)).toBeInTheDocument();
    expect(screen.getByText(dict.upload.browse)).toBeInTheDocument();
  });

  it("disabled state renders without browse content", () => {
    render(
      <StickerUploader
        existingCount={200}
        dict={dict}
        onAdd={vi.fn()}
        disabled
      />,
    );
    expect(screen.queryByText(dict.upload.dropPrompt)).not.toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
  });
});
