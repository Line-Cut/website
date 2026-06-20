import { Check, Clock, Package, Truck, CheckCircle, Ban, Circle } from "lucide-react";
import type { OrderStatus } from "@/lib/stickers/types";
import type { Dictionary } from "@/lib/dictionary";

type Props = {
  status: OrderStatus;
  dict: Dictionary["stickers"]["status"];
};

type StepKey = Exclude<OrderStatus, "cancelled">;

const STEP_ORDER: StepKey[] = [
  "received",
  "in_production",
  "ready",
  "shipped",
  "delivered",
];

function stepIcon(key: StepKey, state: "done" | "current" | "upcoming") {
  const baseClass = "h-5 w-5 shrink-0";

  if (state === "done") {
    return <CheckCircle className={`${baseClass} text-accent`} aria-hidden="true" />;
  }
  if (state === "current") {
    switch (key) {
      case "received":
        return <Clock className={`${baseClass} text-accent`} aria-hidden="true" />;
      case "in_production":
        return <Package className={`${baseClass} text-accent`} aria-hidden="true" />;
      case "ready":
        return <Check className={`${baseClass} text-accent`} aria-hidden="true" />;
      case "shipped":
        return <Truck className={`${baseClass} text-accent`} aria-hidden="true" />;
      case "delivered":
        return <CheckCircle className={`${baseClass} text-accent`} aria-hidden="true" />;
    }
  }
  // upcoming
  return <Circle className={`${baseClass} text-muted opacity-40`} aria-hidden="true" />;
}

/** Pure presentational — no hooks, server-safe. */
export function OrderStatusTimeline({ status, dict }: Props) {
  if (status === "cancelled") {
    return (
      <ol className="flex flex-col gap-3">
        <li className="flex items-center gap-3">
          <Ban className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <span className="font-medium text-ink">{dict.cancelled}</span>
        </li>
      </ol>
    );
  }

  const currentIndex = STEP_ORDER.indexOf(status as StepKey);

  return (
    <ol className="flex flex-col gap-3" aria-label={dict.heading}>
      {STEP_ORDER.map((key, i) => {
        const state =
          i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        const isCurrent = state === "current";

        return (
          <li
            key={key}
            className="flex items-center gap-3"
            aria-current={isCurrent ? "step" : undefined}
          >
            {stepIcon(key, state)}
            <span
              className={
                state === "upcoming"
                  ? "text-muted opacity-60"
                  : state === "done"
                    ? "text-muted line-through"
                    : "font-semibold text-ink"
              }
            >
              {dict[key]}
            </span>
            {isCurrent && (
              <span className="ms-auto text-xs text-accent font-medium">
                {dict.current}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
