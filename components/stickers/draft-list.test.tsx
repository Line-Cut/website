import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DraftList } from "@/components/stickers/draft-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/image", () => ({ default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} /> }));
const mockDiscard = vi.fn(async (_orderId: string) => ({ ok: true }));
vi.mock("@/app/actions/stickers", () => ({ discardDraft: (orderId: string) => mockDiscard(orderId) }));

const dict = {
  drafts: { heading: "In-progress", empty: "No saved drafts.", stickerCount: "{count} stickers · {copies} copies", continueEditing: "Continue editing", continueCheckout: "Continue to checkout", discard: "Discard", discardConfirm: "Sure?" },
} as unknown as import("@/lib/dictionary").Dictionary["stickers"];

const drafts = [{ orderId: "o1", guestToken: "gt1", stickerCount: 3, copies: 2, breakdown: { uniqueCount: 3, copies: 2, perSheet: 0, perSheetRate: 0, sheetsPerSet: 0, totalSheets: 0, sheetsSubtotal: 0, setupFee: 0, total: 0, currency: "ILS" }, updatedAtISO: "2026-06-24T10:00:00.000Z", thumbnailUrl: "https://signed/t" }];

describe("DraftList", () => {
  it("renders each draft with a Continue editing link to the builder", () => {
    render(<DraftList drafts={drafts} dict={dict} lang="en" />);
    const link = screen.getByRole("link", { name: "Continue editing" });
    expect(link).toHaveAttribute("href", "/en/stickers?draft=o1");
  });

  it("shows the empty state when there are no drafts", () => {
    render(<DraftList drafts={[]} dict={dict} lang="en" />);
    expect(screen.getByText("No saved drafts.")).toBeInTheDocument();
  });

  it("calls discardDraft after confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DraftList drafts={drafts} dict={dict} lang="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(mockDiscard).toHaveBeenCalledWith("o1");
  });
});
