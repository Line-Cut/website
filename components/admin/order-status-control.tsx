"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateOrderStatus } from "@/app/actions/admin-orders";
import { ORDER_STATUSES } from "@/lib/orders/admin-types";
import type { OrderStatus } from "@/lib/orders/types";
import type { Dictionary } from "@/lib/dictionary";

type Props = {
  orderId: string;
  current: OrderStatus;
  statusDict: Record<string, string>;
  dict: Dictionary["admin"]["orders"];
};

export function OrderStatusControl({
  orderId,
  current,
  statusDict,
  dict,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState<OrderStatus>(current);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(
    null,
  );

  function onSave() {
    startTransition(async () => {
      const res = await updateOrderStatus(orderId, value);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="order-status" className="text-sm font-medium text-ink">
        {dict.updateStatus}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <select
          id="order-status"
          value={value}
          onChange={(e) => {
            setValue(e.target.value as OrderStatus);
            setResult(null);
          }}
          disabled={isPending}
          className="h-11 rounded-md border border-line bg-paper px-3 text-ink outline-none focus:border-accent"
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusDict[s] ?? s}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={isPending || value === current}
        >
          {isPending ? dict.saving : dict.save}
        </Button>
        {result?.ok && (
          <span aria-live="polite" className="text-sm text-green-700">
            {dict.saved}
          </span>
        )}
        {result && !result.ok && (
          <span aria-live="assertive" className="text-sm text-accent">
            {result.message ?? dict.save}
          </span>
        )}
      </div>
    </div>
  );
}
