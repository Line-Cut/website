import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { A4Page } from "@/components/stickers/a4-page";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, src } = props as { alt: string; src: string };
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />;
  },
}));

describe("A4Page", () => {
  it("renders all provided images", () => {
    render(
      <A4Page
        srcs={["/a.webp", "/b.webp", "/c.webp"]}
        columns={3}
        gutterPct={2}
        marginPct={5}
        label="Sheet 1 of 1"
      />,
    );
    // Images have alt="" so they get role="presentation" (decorative)
    const imgs = document.querySelectorAll("img");
    expect(imgs).toHaveLength(3);
  });

  it("renders with an accessible label", () => {
    render(
      <A4Page
        srcs={["/a.webp"]}
        columns={3}
        gutterPct={2}
        marginPct={5}
        label="A4 preview"
      />,
    );
    expect(screen.getByLabelText("A4 preview")).toBeInTheDocument();
  });
});
