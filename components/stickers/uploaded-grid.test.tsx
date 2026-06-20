import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadedGrid } from "@/components/stickers/uploaded-grid";
import type { LocalSticker } from "@/lib/stickers/types";

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
    countLabel: "{count} / {max} stickers",
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
};

function makeItem(id: string, name: string): LocalSticker {
  return {
    id,
    name,
    objectUrl: `blob:http://localhost/${id}`,
    bytes: 512,
    status: "ready",
  };
}

describe("UploadedGrid", () => {
  it("renders N thumb images for N items", () => {
    const items = [
      makeItem("1", "a.webp"),
      makeItem("2", "b.webp"),
      makeItem("3", "c.webp"),
    ];
    render(<UploadedGrid items={items} dict={dict} onRemove={vi.fn()} />);
    expect(screen.getByAltText("a.webp")).toBeInTheDocument();
    expect(screen.getByAltText("b.webp")).toBeInTheDocument();
    expect(screen.getByAltText("c.webp")).toBeInTheDocument();
  });

  it("count label shows N / 200", () => {
    const items = [makeItem("1", "a.webp"), makeItem("2", "b.webp")];
    render(<UploadedGrid items={items} dict={dict} onRemove={vi.fn()} />);
    expect(screen.getByText("2 / 200 stickers")).toBeInTheDocument();
  });

  it("clicking a thumb's remove button calls onRemove with that id", () => {
    const onRemove = vi.fn();
    const items = [makeItem("id-abc", "logo.webp")];
    render(<UploadedGrid items={items} dict={dict} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove logo.webp" }));
    expect(onRemove).toHaveBeenCalledWith("id-abc");
  });

  it("renders 0 thumbs when items is empty", () => {
    render(<UploadedGrid items={[]} dict={dict} onRemove={vi.fn()} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("0 / 200 stickers")).toBeInTheDocument();
  });
});
