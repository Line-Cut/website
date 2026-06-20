import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CopiesStepper } from "@/components/stickers/copies-stepper";

const dict = {
  heading: "Your order",
  copies: "Copies (full sets)",
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
  uploading: "Uploading…",
};

describe("CopiesStepper", () => {
  it("renders the current value in the input", () => {
    render(<CopiesStepper value={3} onChange={vi.fn()} dict={dict} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(3);
  });

  it("clicking + calls onChange with value + 1", () => {
    const onChange = vi.fn();
    render(<CopiesStepper value={2} onChange={onChange} dict={dict} />);
    fireEvent.click(screen.getByLabelText(dict.increase));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("clicking − calls onChange with value - 1 when above min", () => {
    const onChange = vi.fn();
    render(<CopiesStepper value={3} onChange={onChange} dict={dict} />);
    fireEvent.click(screen.getByLabelText(dict.decrease));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("clicking − at min is disabled and onChange is not called", () => {
    const onChange = vi.fn();
    render(<CopiesStepper value={1} onChange={onChange} dict={dict} min={1} />);
    const decreaseBtn = screen.getByLabelText(dict.decrease);
    expect(decreaseBtn).toBeDisabled();
    fireEvent.click(decreaseBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("entering '0' clamps to min on change", () => {
    const onChange = vi.fn();
    render(<CopiesStepper value={2} onChange={onChange} dict={dict} min={1} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("entering '' (empty) clamps to min on change", () => {
    const onChange = vi.fn();
    render(<CopiesStepper value={2} onChange={onChange} dict={dict} min={1} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("entering '2.7' floors to 2 on change", () => {
    const onChange = vi.fn();
    render(<CopiesStepper value={1} onChange={onChange} dict={dict} min={1} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "2.7" } });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("has a label with dict.copies text", () => {
    render(<CopiesStepper value={1} onChange={vi.fn()} dict={dict} />);
    expect(screen.getByText(dict.copies)).toBeInTheDocument();
  });
});
