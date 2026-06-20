import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceBreakdownView } from "@/components/stickers/price-breakdown";
import type { PriceBreakdown } from "@/lib/stickers/pricing";

const dict = {
  heading: "Your order",
  copies: "Copies",
  copiesHint: "Each copy prints all stickers once.",
  increase: "Increase copies",
  decrease: "Decrease copies",
  uniqueCount: "Unique stickers",
  sheetsPerSet: "Sheets per set",
  totalSheets: "Total A4 sheets",
  perSheetRate: "Rate per sheet",
  setupFee: "One-time setup",
  sheetsSubtotal: "Sheets subtotal",
  total: "Total",
  pricePending: "Final price confirmed before printing.",
  continue: "Continue to checkout",
};

const nonZeroBreakdown: PriceBreakdown = {
  uniqueCount: 3,
  copies: 2,
  perSheet: 15,
  perSheetRate: 1000,     // 10.00 ILS in agorot — distinct from perSheet count
  sheetsPerSet: 1,
  totalSheets: 2,
  sheetsSubtotal: 2000,  // 20.00 ILS in agorot
  setupFee: 500,          // 5.00 ILS
  total: 2500,            // 25.00 ILS
  currency: "ILS",
};

const zeroPricePendingBreakdown: PriceBreakdown = {
  uniqueCount: 3,
  copies: 1,
  perSheet: 15,
  perSheetRate: 0,
  sheetsPerSet: 1,
  totalSheets: 1,
  sheetsSubtotal: 0,
  setupFee: 0,
  total: 0,
  currency: "ILS",
};

describe("PriceBreakdownView", () => {
  it("renders money total for a nonzero-rate breakdown", () => {
    render(<PriceBreakdownView breakdown={nonZeroBreakdown} dict={dict} locale="en" />);
    // Total row should show a formatted currency value, not the pending text
    expect(screen.queryByText(dict.pricePending)).not.toBeInTheDocument();
    // The total "25.00 ILS" or similar should appear somewhere
    const totalRow = screen.getByText(dict.total).closest("tr");
    expect(totalRow).toBeInTheDocument();
    // Some formatted money in the total cell
    const tds = totalRow!.querySelectorAll("td");
    expect(tds[1].textContent).toMatch(/\d/); // has digits
  });

  it("renders pricePending text when uniqueCount > 0 but subtotal and setupFee are 0", () => {
    render(
      <PriceBreakdownView breakdown={zeroPricePendingBreakdown} dict={dict} locale="en" />,
    );
    expect(screen.getByText(dict.pricePending)).toBeInTheDocument();
    // Should NOT show a numeric "0" in the total cell
    const totalRow = screen.getByText(dict.total).closest("tr");
    expect(totalRow).toBeInTheDocument();
    const tds = totalRow!.querySelectorAll("td");
    // The total cell should contain the pending message, not a formatted zero
    expect(tds[1].textContent).not.toMatch(/₪0/);
    expect(tds[1].textContent).not.toMatch(/ILS\s*0/);
  });

  it("shows setup fee row only when setupFee > 0", () => {
    // Without setup fee
    render(
      <PriceBreakdownView breakdown={zeroPricePendingBreakdown} dict={dict} locale="en" />,
    );
    expect(screen.queryByText(dict.setupFee)).not.toBeInTheDocument();
  });

  it("shows setup fee row when setupFee > 0", () => {
    render(<PriceBreakdownView breakdown={nonZeroBreakdown} dict={dict} locale="en" />);
    expect(screen.getByText(dict.setupFee)).toBeInTheDocument();
  });

  it("rate row shows the formatted money rate (perSheetRate), not the stickers-per-sheet count", () => {
    render(<PriceBreakdownView breakdown={nonZeroBreakdown} dict={dict} locale="en" />);
    const rateRow = screen.getByText(dict.perSheetRate).closest("tr");
    expect(rateRow).toBeInTheDocument();
    const tds = rateRow!.querySelectorAll("td");
    const rateCell = tds[1].textContent ?? "";
    // perSheetRate = 1000 agorot = 10.00 ILS — should be formatted as money
    expect(rateCell).toMatch(/\d/);
    // Must NOT show the raw stickers-per-sheet count (15) without any currency formatting
    // The cell should look like a currency amount, not just "15"
    expect(rateCell).not.toBe("15");
  });

  it("shows sheetsSubtotal row for nonzero breakdown", () => {
    render(<PriceBreakdownView breakdown={nonZeroBreakdown} dict={dict} locale="en" />);
    expect(screen.getByText(dict.sheetsSubtotal)).toBeInTheDocument();
    const subtotalRow = screen.getByText(dict.sheetsSubtotal).closest("tr");
    expect(subtotalRow).toBeInTheDocument();
    const tds = subtotalRow!.querySelectorAll("td");
    // sheetsSubtotal = 2000 agorot = 20.00 ILS
    expect(tds[1].textContent).toMatch(/\d/);
  });

  it("hides sheetsSubtotal row when sheetsSubtotal is 0", () => {
    render(
      <PriceBreakdownView breakdown={zeroPricePendingBreakdown} dict={dict} locale="en" />,
    );
    expect(screen.queryByText(dict.sheetsSubtotal)).not.toBeInTheDocument();
  });
});
