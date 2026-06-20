import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StickerThumb } from "@/components/stickers/sticker-thumb";
import type { LocalSticker } from "@/lib/stickers/types";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, src } = props as { alt: string; src: string };
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />;
  },
}));

const dict = {
  remove: "Remove",
  removeLabel: "Remove {name}",
  failed: "Failed",
};

function makeItem(overrides: Partial<LocalSticker> = {}): LocalSticker {
  return {
    id: "abc-123",
    name: "sticker.webp",
    objectUrl: "blob:http://localhost/fake",
    bytes: 1024,
    status: "ready",
    ...overrides,
  };
}

describe("StickerThumb", () => {
  it("renders the image with alt equal to item.name", () => {
    render(
      <StickerThumb item={makeItem()} dict={dict} onRemove={vi.fn()} />,
    );
    expect(screen.getByAltText("sticker.webp")).toBeInTheDocument();
  });

  it("remove button has the interpolated aria-label", () => {
    render(
      <StickerThumb item={makeItem()} dict={dict} onRemove={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: "Remove sticker.webp" }),
    ).toBeInTheDocument();
  });

  it("clicking remove button calls onRemove with the item id", () => {
    const onRemove = vi.fn();
    render(
      <StickerThumb
        item={makeItem({ id: "xyz-456", name: "logo.webp" })}
        dict={dict}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove logo.webp" }));
    expect(onRemove).toHaveBeenCalledWith("xyz-456");
  });

  it("shows failed overlay text when status is failed", () => {
    render(
      <StickerThumb
        item={makeItem({ status: "failed" })}
        dict={dict}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("does not show failed overlay when status is ready", () => {
    render(
      <StickerThumb
        item={makeItem({ status: "ready" })}
        dict={dict}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });
});
