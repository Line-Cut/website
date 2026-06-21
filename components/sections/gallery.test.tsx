import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Gallery } from "@/components/sections/gallery";
import { PROJECTS } from "@/lib/content";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, src } = props as { alt: string; src: string };
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />;
  },
}));

const dict = { heading: "Work", intro: "intro", imageAltPrefix: "Project" };

describe("Gallery / Portfolio", () => {
  it("renders one tile per project in PROJECTS", () => {
    render(<Gallery dict={dict} />);
    expect(screen.getAllByRole("img")).toHaveLength(PROJECTS.length);
  });
});
