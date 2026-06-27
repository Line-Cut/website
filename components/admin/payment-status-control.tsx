"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updatePaymentStatus } from "@/app/actions/admin-orders";
import { PAYMENT_STATUSES } from "@/lib/orders/admin-types";
import type { PaymentStatus } from "@/lib/orders/types";
import type { Dictionary } from "@/lib/dictionary";

type Props = {
  orderId: string;
  current: PaymentStatus;
  reference: string | null;
  dict: Dictionary["admin"]["orders"];
};

export function PaymentStatusControl({
  orderId,
  current,
  reference,
  dict,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState<PaymentStatus>(current);
  const [ref, setRef] = useState(reference ?? "");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(
    null,
  );

  function onSave() {
    startTransition(async () => {
      const res = await updatePaymentStatus(orderId, value, ref);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="payment-status" className="text-sm font-medium text-ink">
        {dict.updatePayment}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          id="payment-status"
          value={value}
          onChange={(e) => {
            setValue(e.target.value as PaymentStatus);
            setResult(null);
          }}
          disabled={isPending}
          className="h-11 rounded-md border border-line bg-paper px-3 text-ink outline-none focus:border-accent"
        >
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <label htmlFor="payment-ref" className="sr-only">
          {dict.paymentReference}
        </label>
        <input
          id="payment-ref"
          type="text"
          dir="ltr"
          value={ref}
          onChange={(e) => {
            setRef(e.target.value);
            setResult(null);
          }}
          placeholder={dict.referencePlaceholder}
          disabled={isPending}
          className="h-11 w-full rounded-md border border-line bg-paper px-3 text-ink outline-none focus:border-accent sm:w-64"
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={isPending}
        >
          {isPending ? dict.saving : dict.save}
        </Button>
      </div>
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
  );
}
