import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { A4Preview } from "@/components/stickers/a4-preview";
import { computePacking } from "@/lib/stickers/packing";
import { stickerConfig } from "@/lib/stickers/sticker-config";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, src } = props as { alt: string; src: string };
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />;
  },
}));

const { perSheet } = computePacking(stickerConfig);

const dict = {
  heading: "Sheet Preview",
  disclaimer: "Preview only — final layout may differ.",
  page: "Sheet {current} of {total}",
  prev: "Previous sheet",
  next: "Next sheet",
  perSheet: "{n} stickers per A4 sheet",
};

function makeSrcs(count: number) {
  return Array.from({ length: count }, (_, i) => `/sticker-${i}.webp`);
}

describe("A4Preview", () => {
  it("renders null when srcs is empty", () => {
    const { container } = render(
      <A4Preview srcs={[]} dict={dict} locale="en" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows disclaimer with role=note when there is 1 sticker (≤ perSheet)", () => {
    render(<A4Preview srcs={makeSrcs(1)} dict={dict} locale="en" />);
    const note = screen.getByRole("note");
    expect(note).toBeInTheDocument();
    expect(note.textContent).toContain(dict.disclaimer);
  });

  it("does NOT render nav buttons when totalPages is 1", () => {
    render(<A4Preview srcs={makeSrcs(1)} dict={dict} locale="en" />);
    expect(screen.queryByRole("button", { name: dict.prev })).toBeNull();
    expect(screen.queryByRole("button", { name: dict.next })).toBeNull();
  });

  it("shows nav buttons with 2 pages (perSheet+1 stickers)", () => {
    render(
      <A4Preview srcs={makeSrcs(perSheet + 1)} dict={dict} locale="en" />,
    );
    expect(screen.getByRole("button", { name: dict.prev })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: dict.next })).toBeInTheDocument();
  });

  it("prev is disabled and next is enabled on page 1 of 2", () => {
    render(
      <A4Preview srcs={makeSrcs(perSheet + 1)} dict={dict} locale="en" />,
    );
    expect(screen.getByRole("button", { name: dict.prev })).toBeDisabled();
    expect(screen.getByRole("button", { name: dict.next })).not.toBeDisabled();
  });

  it("clicking next updates page status to sheet 2 and disables next / enables prev", () => {
    render(
      <A4Preview srcs={makeSrcs(perSheet + 1)} dict={dict} locale="en" />,
    );

    // Initial state: page 1 of 2
    expect(screen.getByText("Sheet 1 of 2")).toBeInTheDocument();

    // Navigate forward
    fireEvent.click(screen.getByRole("button", { name: dict.next }));

    // Now on page 2 of 2
    expect(screen.getByText("Sheet 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: dict.next })).toBeDisabled();
    expect(screen.getByRole("button", { name: dict.prev })).not.toBeDisabled();
  });

  it("clicking prev from page 2 goes back to page 1", () => {
    render(
      <A4Preview srcs={makeSrcs(perSheet + 1)} dict={dict} locale="en" />,
    );
    fireEvent.click(screen.getByRole("button", { name: dict.next }));
    expect(screen.getByText("Sheet 2 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: dict.prev }));
    expect(screen.getByText("Sheet 1 of 2")).toBeInTheDocument();
  });

  it("clamps currentPage when srcs shrinks below the current page", () => {
    const { rerender } = render(
      <A4Preview srcs={makeSrcs(perSheet + 1)} dict={dict} locale="en" />,
    );
    fireEvent.click(screen.getByRole("button", { name: dict.next }));
    expect(screen.getByText("Sheet 2 of 2")).toBeInTheDocument();

    // Shrink to a single sticker → totalPages drops to 1; nav disappears, no crash
    rerender(<A4Preview srcs={makeSrcs(1)} dict={dict} locale="en" />);
    expect(screen.queryByRole("button", { name: dict.prev })).toBeNull();
    expect(screen.queryByRole("button", { name: dict.next })).toBeNull();
  });
});
