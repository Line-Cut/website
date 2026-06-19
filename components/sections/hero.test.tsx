import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/sections/hero";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, src } = props as { alt: string; src: string };
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />;
  },
}));

const dict = {
  eyebrow: "Line Cut",
  title: "Produced accurately",
  subtitle: "sub",
  ctaPrimary: "WhatsApp",
  ctaSecondary: "Contact",
  ctaMessage: "hi",
  imageAlt: "work",
};

describe("Hero", () => {
  it("renders the headline and CTAs", () => {
    render(<Hero dict={dict} />);
    expect(
      screen.getByRole("heading", { name: "Produced accurately" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toBeInTheDocument();
  });
});
