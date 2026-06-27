"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { parseCheckout } from "@/lib/stickers/checkout-schema";
import { confirmStoreOrder, quoteStoreCart } from "@/app/actions/store";
import { useCart, toServerItems } from "@/components/store/cart-provider";
import {
  DeliveryFields,
  emptyDelivery,
  type DeliveryValues,
} from "@/components/checkout/delivery-fields";
import { StoreLineItems, type DisplayLineItem } from "@/components/store/store-line-items";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

const REQUEST_KEY = "linecut_store_request";

function getClientRequestId(): string {
  try {
    let id = sessionStorage.getItem(REQUEST_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(REQUEST_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

const SERVER_ERROR_KEY: Record<string, keyof Dictionary["store"]["errors"]> = {
  items_unavailable: "itemsUnavailable",
  payment_failed: "paymentFailed",
  invalid_cart: "emptyCart",
  empty: "emptyCart",
  db_error: "serverError",
};

const FOCUS_ORDER = ["firstName", "lastName", "phone", "email", "addressLine1", "city", "postalCode"];

export function StoreCheckout({ dict, lang }: { dict: Dictionary["store"]; lang: Locale }) {
  const router = useRouter();
  const { items, hydrated, clear, removeByProductIds } = useCart();
  const [summary, setSummary] =
    useState<{ lines: DisplayLineItem[]; total: number; currency: string } | null>(null);
  const [values, setValues] = useState<DeliveryValues>(emptyDelivery);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [genericError, setGenericError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!hydrated || items.length === 0) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    quoteStoreCart(toServerItems(items), lang).then((res) => {
      if (cancelled || !res.ok) return;
      if (res.removed.length) removeByProductIds(res.removed);
      setSummary({ lines: res.lines, total: res.total, currency: res.currency });
    });
    return () => {
      cancelled = true;
    };
  }, [items, hydrated, lang, removeByProductIds]);

  function setFieldRef(name: string) {
    return (el: HTMLInputElement | null) => {
      fieldRefs.current[name] = el;
    };
  }

  function update(field: keyof DeliveryValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function getFormData(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      method: values.method,
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      email: values.email,
      notes: values.notes || undefined,
    };
    if (values.method === "shipping") {
      data.addressLine1 = values.addressLine1;
      data.addressLine2 = values.addressLine2 || undefined;
      data.city = values.city;
      data.postalCode = values.postalCode;
      data.country = values.country || undefined;
    }
    return data;
  }

  function handleBlur(field: keyof DeliveryValues) {
    const parsed = parseCheckout(getFormData());
    if (!parsed.success && parsed.errors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: parsed.errors[field] }));
    } else {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function focusFirstInvalid(errors: Record<string, string>) {
    for (const key of FOCUS_ORDER) {
      if (errors[key] && fieldRefs.current[key]) {
        fieldRefs.current[key]?.focus();
        break;
      }
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending || items.length === 0) return;

    const parsed = parseCheckout(getFormData());
    if (!parsed.success) {
      setFieldErrors(parsed.errors);
      focusFirstInvalid(parsed.errors);
      return;
    }
    setFieldErrors({});
    setGenericError(null);

    startTransition(async () => {
      const result = await confirmStoreOrder({
        items: toServerItems(items),
        delivery: parsed.data,
        clientRequestId: getClientRequestId(),
      });

      if (result.ok) {
        clear();
        try {
          sessionStorage.removeItem(REQUEST_KEY);
        } catch {
          /* ignore */
        }
        router.push(`/${lang}/store/track/${result.guestToken}`);
        return;
      }
      if (result.errors) {
        setFieldErrors(result.errors);
        focusFirstInvalid(result.errors);
        return;
      }
      if (result.removed?.length) {
        removeByProductIds(result.removed);
      }
      setGenericError(dict.errors[SERVER_ERROR_KEY[result.message] ?? "serverError"]);
    });
  }

  if (hydrated && items.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-paper p-8 text-center">
        <p className="mb-4 text-muted">{dict.checkout.emptyCart}</p>
        <Button asChild variant="outline">
          <Link href={`/${lang}/store`}>{dict.cart.continueShopping}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Summary */}
      <section aria-label={dict.checkout.summary} className="order-2 md:order-1">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          {dict.checkout.summary}
        </h2>
        {summary && (
          <StoreLineItems
            items={summary.lines}
            total={summary.total}
            currency={summary.currency}
            dict={dict}
            locale={lang}
          />
        )}
      </section>

      {/* Delivery form */}
      <form onSubmit={handleSubmit} noValidate className="order-1 flex flex-col gap-6 md:order-2">
        <div
          role="note"
          className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm font-medium text-accent"
        >
          {dict.checkout.paymentNote}
        </div>

        {genericError && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent"
          >
            {genericError}
          </div>
        )}

        <DeliveryFields
          values={values}
          errors={fieldErrors}
          onChange={update}
          onBlur={handleBlur}
          setFieldRef={setFieldRef}
          labels={dict.checkout}
          fieldErrorLabels={dict.fieldErrors}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button asChild variant="outline" type="button">
            <Link href={`/${lang}/store/cart`}>{dict.checkout.back}</Link>
          </Button>
          <Button type="submit" variant="primary" disabled={isPending} className="min-h-[44px]">
            {isPending ? dict.checkout.placing : dict.checkout.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}
