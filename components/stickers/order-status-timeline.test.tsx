import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderStatusTimeline } from "@/components/stickers/order-status-timeline";

const dict = {
  heading: "Order status",
  received: "Received",
  seen: "Seen",
  in_production: "In Production",
  ready: "Ready",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  current: "Current step",
};

describe("OrderStatusTimeline", () => {
  it('marks in_production step as aria-current="step"', () => {
    render(<OrderStatusTimeline status="in_production" dict={dict} />);

    const inProductionItem = screen
      .getByText(dict.in_production)
      .closest("li");
    expect(inProductionItem).toHaveAttribute("aria-current", "step");
  });

  it("does not mark other steps as aria-current", () => {
    render(<OrderStatusTimeline status="in_production" dict={dict} />);

    const receivedItem = screen.getByText(dict.received).closest("li");
    expect(receivedItem).not.toHaveAttribute("aria-current");

    const deliveredItem = screen.getByText(dict.delivered).closest("li");
    expect(deliveredItem).not.toHaveAttribute("aria-current");
  });

  it("shows all lifecycle steps for an active status", () => {
    render(<OrderStatusTimeline status="in_production" dict={dict} />);

    expect(screen.getByText(dict.received)).toBeInTheDocument();
    expect(screen.getByText(dict.in_production)).toBeInTheDocument();
    expect(screen.getByText(dict.ready)).toBeInTheDocument();
    expect(screen.getByText(dict.shipped)).toBeInTheDocument();
    expect(screen.getByText(dict.delivered)).toBeInTheDocument();
  });

  it("shows cancelled state instead of steps for cancelled status", () => {
    render(<OrderStatusTimeline status="cancelled" dict={dict} />);
    expect(screen.getByText(dict.cancelled)).toBeInTheDocument();
    // Should not show the normal step labels
    expect(screen.queryByText(dict.received)).not.toBeInTheDocument();
    expect(screen.queryByText(dict.in_production)).not.toBeInTheDocument();
  });

  it("marks received step as current when status is received", () => {
    render(<OrderStatusTimeline status="received" dict={dict} />);
    const receivedItem = screen.getByText(dict.received).closest("li");
    expect(receivedItem).toHaveAttribute("aria-current", "step");
    // Later steps should not be current
    const deliveredItem = screen.getByText(dict.delivered).closest("li");
    expect(deliveredItem).not.toHaveAttribute("aria-current");
  });
});
