"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { parseCheckout } from "@/lib/stickers/checkout-schema";
import { confirmOrder } from "@/app/actions/stickers";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrderHandle = { orderId: string; guestToken: string };

type FormValues = {
  method: "pickup" | "shipping";
  fullName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
  notes: string;
};

type Props = {
  dict: Dictionary["stickers"];
  lang: Locale;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readOrderHandle(): OrderHandle | null {
  try {
    const raw = sessionStorage.getItem("linecut_order");
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "orderId" in parsed &&
      "guestToken" in parsed &&
      typeof (parsed as Record<string, unknown>).orderId === "string" &&
      typeof (parsed as Record<string, unknown>).guestToken === "string"
    ) {
      return parsed as OrderHandle;
    }
    return null;
  } catch {
    return null;
  }
}

const emptyForm: FormValues = {
  method: "pickup",
  fullName: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  country: "",
  notes: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CheckoutForm({ dict, lang }: Props) {
  const router = useRouter();
  const [handle, setHandle] = useState<OrderHandle | null | "loading">("loading");
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [genericError, setGenericError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Refs for focusing the first invalid field
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  // On mount: read from sessionStorage
  useEffect(() => {
    setHandle(readOrderHandle());
  }, []);

  function setFieldRef(name: string) {
    return (el: HTMLElement | null) => {
      fieldRefs.current[name] = el;
    };
  }

  function update(field: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function getFormData(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      method: values.method,
      fullName: values.fullName,
      phone: values.phone,
      email: values.email,
    };
    if (values.method === "shipping") {
      data.addressLine1 = values.addressLine1;
      data.addressLine2 = values.addressLine2 || undefined;
      data.city = values.city;
      data.postalCode = values.postalCode;
      data.country = values.country || undefined;
      data.notes = values.notes || undefined;
    } else {
      data.notes = values.notes || undefined;
    }
    return data;
  }

  function focusFirstInvalid(errors: Record<string, string>) {
    const order = [
      "fullName",
      "phone",
      "email",
      "addressLine1",
      "city",
      "postalCode",
    ];
    for (const key of order) {
      if (errors[key] && fieldRefs.current[key]) {
        fieldRefs.current[key]?.focus();
        break;
      }
    }
  }

  function handleBlur(field: keyof FormValues) {
    const parsed = parseCheckout(getFormData());
    if (!parsed.success) {
      // Only show errors for the blurred field
      if (parsed.errors[field]) {
        setFieldErrors((prev) => ({ ...prev, [field]: parsed.errors[field] }));
      }
    } else {
      // Field is now valid — clear its error
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending || handle === "loading" || handle === null) return;

    // Client-side validation
    const parsed = parseCheckout(getFormData());
    if (!parsed.success) {
      setFieldErrors(parsed.errors);
      focusFirstInvalid(parsed.errors);
      return;
    }

    setFieldErrors({});
    setGenericError(null);

    startTransition(async () => {
      const result = await confirmOrder({
        orderId: handle.orderId,
        guestToken: handle.guestToken,
        delivery: parsed.data,
      });

      if (result.ok) {
        sessionStorage.removeItem("linecut_order");
        router.push(`/${lang}/stickers/track/${result.guestToken}`);
      } else if (result.errors) {
        setFieldErrors(result.errors);
        focusFirstInvalid(result.errors);
      } else {
        setGenericError(result.message ?? "error");
      }
    });
  }

  // Still reading sessionStorage
  if (handle === "loading") {
    return null;
  }

  // No active order in sessionStorage
  if (handle === null) {
    return (
      <div className="rounded-md border border-line bg-paper p-6 text-ink">
        <p className="mb-4 text-base">{dict.checkout.noActiveOrder}</p>
        <Link
          href={`/${lang}/stickers`}
          className="text-accent underline underline-offset-2 hover:text-accent/80"
        >
          {dict.checkout.backToBuilder}
        </Link>
      </div>
    );
  }

  const isShipping = values.method === "shipping";
  const checkout = dict.checkout;
  const fe = dict.fieldErrors;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* Payment note */}
      <div
        role="note"
        className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm font-medium text-accent"
      >
        {checkout.paymentNote}
      </div>

      {/* Generic server error */}
      {genericError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent"
        >
          {genericError}
        </div>
      )}

      {/* Delivery method */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">
          {checkout.heading}
        </legend>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name="method"
            value="pickup"
            checked={values.method === "pickup"}
            onChange={() => update("method", "pickup")}
            className="accent-accent"
          />
          {checkout.methodPickup}
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name="method"
            value="shipping"
            checked={values.method === "shipping"}
            onChange={() => update("method", "shipping")}
            className="accent-accent"
          />
          {checkout.methodShipping}
        </label>
      </fieldset>

      {/* Full name */}
      <div className="flex flex-col gap-1">
        <label htmlFor="fullName" className="text-sm font-medium text-ink">
          {checkout.fields.fullName}
        </label>
        <input
          id="fullName"
          type="text"
          autoComplete="name"
          value={values.fullName}
          onChange={(e) => update("fullName", e.target.value)}
          onBlur={() => handleBlur("fullName")}
          ref={setFieldRef("fullName") as React.RefCallback<HTMLInputElement>}
          aria-describedby={fieldErrors.fullName ? "err-fullName" : undefined}
          aria-invalid={!!fieldErrors.fullName}
          className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent"
        />
        {fieldErrors.fullName && (
          <span
            id="err-fullName"
            aria-live="polite"
            className="text-xs text-accent"
          >
            {fe[fieldErrors.fullName as keyof typeof fe] ?? fieldErrors.fullName}
          </span>
        )}
      </div>

      {/* Phone */}
      <div className="flex flex-col gap-1">
        <label htmlFor="phone" className="text-sm font-medium text-ink">
          {checkout.fields.phone}
        </label>
        <input
          id="phone"
          type="tel"
          dir="ltr"
          autoComplete="tel"
          value={values.phone}
          onChange={(e) => update("phone", e.target.value)}
          onBlur={() => handleBlur("phone")}
          ref={setFieldRef("phone") as React.RefCallback<HTMLInputElement>}
          aria-describedby={fieldErrors.phone ? "err-phone" : undefined}
          aria-invalid={!!fieldErrors.phone}
          className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent"
        />
        {fieldErrors.phone && (
          <span
            id="err-phone"
            aria-live="polite"
            className="text-xs text-accent"
          >
            {fe[fieldErrors.phone as keyof typeof fe] ?? fieldErrors.phone}
          </span>
        )}
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          {checkout.fields.email}
        </label>
        <input
          id="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          value={values.email}
          onChange={(e) => update("email", e.target.value)}
          onBlur={() => handleBlur("email")}
          ref={setFieldRef("email") as React.RefCallback<HTMLInputElement>}
          aria-describedby={fieldErrors.email ? "err-email" : undefined}
          aria-invalid={!!fieldErrors.email}
          className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent"
        />
        {fieldErrors.email && (
          <span
            id="err-email"
            aria-live="polite"
            className="text-xs text-accent"
          >
            {fe[fieldErrors.email as keyof typeof fe] ?? fieldErrors.email}
          </span>
        )}
      </div>

      {/* Shipping fields (progressive disclosure) */}
      {isShipping && (
        <>
          {/* Address line 1 */}
          <div className="flex flex-col gap-1">
            <label htmlFor="addressLine1" className="text-sm font-medium text-ink">
              {checkout.fields.addressLine1}
            </label>
            <input
              id="addressLine1"
              type="text"
              autoComplete="address-line1"
              value={values.addressLine1}
              onChange={(e) => update("addressLine1", e.target.value)}
              onBlur={() => handleBlur("addressLine1")}
              ref={setFieldRef("addressLine1") as React.RefCallback<HTMLInputElement>}
              aria-describedby={fieldErrors.addressLine1 ? "err-addressLine1" : undefined}
              aria-invalid={!!fieldErrors.addressLine1}
              className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent"
            />
            {fieldErrors.addressLine1 && (
              <span
                id="err-addressLine1"
                aria-live="polite"
                className="text-xs text-accent"
              >
                {fe[fieldErrors.addressLine1 as keyof typeof fe] ?? fieldErrors.addressLine1}
              </span>
            )}
          </div>

          {/* Address line 2 (optional) */}
          <div className="flex flex-col gap-1">
            <label htmlFor="addressLine2" className="text-sm font-medium text-ink">
              {checkout.fields.addressLine2}
            </label>
            <input
              id="addressLine2"
              type="text"
              autoComplete="address-line2"
              value={values.addressLine2}
              onChange={(e) => update("addressLine2", e.target.value)}
              className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent"
            />
          </div>

          {/* City */}
          <div className="flex flex-col gap-1">
            <label htmlFor="city" className="text-sm font-medium text-ink">
              {checkout.fields.city}
            </label>
            <input
              id="city"
              type="text"
              autoComplete="address-level2"
              value={values.city}
              onChange={(e) => update("city", e.target.value)}
              onBlur={() => handleBlur("city")}
              ref={setFieldRef("city") as React.RefCallback<HTMLInputElement>}
              aria-describedby={fieldErrors.city ? "err-city" : undefined}
              aria-invalid={!!fieldErrors.city}
              className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent"
            />
            {fieldErrors.city && (
              <span
                id="err-city"
                aria-live="polite"
                className="text-xs text-accent"
              >
                {fe[fieldErrors.city as keyof typeof fe] ?? fieldErrors.city}
              </span>
            )}
          </div>

          {/* Postal code */}
          <div className="flex flex-col gap-1">
            <label htmlFor="postalCode" className="text-sm font-medium text-ink">
              {checkout.fields.postalCode}
            </label>
            <input
              id="postalCode"
              type="text"
              dir="ltr"
              autoComplete="postal-code"
              value={values.postalCode}
              onChange={(e) => update("postalCode", e.target.value)}
              onBlur={() => handleBlur("postalCode")}
              ref={setFieldRef("postalCode") as React.RefCallback<HTMLInputElement>}
              aria-describedby={fieldErrors.postalCode ? "err-postalCode" : undefined}
              aria-invalid={!!fieldErrors.postalCode}
              className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent"
            />
            {fieldErrors.postalCode && (
              <span
                id="err-postalCode"
                aria-live="polite"
                className="text-xs text-accent"
              >
                {fe[fieldErrors.postalCode as keyof typeof fe] ?? fieldErrors.postalCode}
              </span>
            )}
          </div>

          {/* Country (optional) */}
          <div className="flex flex-col gap-1">
            <label htmlFor="country" className="text-sm font-medium text-ink">
              {checkout.fields.country}
            </label>
            <input
              id="country"
              type="text"
              autoComplete="country-name"
              value={values.country}
              onChange={(e) => update("country", e.target.value)}
              className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent"
            />
          </div>
        </>
      )}

      {/* Notes (optional — shown for all methods) */}
      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium text-ink">
          {checkout.fields.notes}
        </label>
        <textarea
          id="notes"
          rows={3}
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          className="rounded-md border border-line bg-paper px-3 py-2 outline-none focus:border-accent"
        />
      </div>

      {/* Submit */}
      <Button
        type="submit"
        variant="primary"
        disabled={isPending}
        className="min-h-[44px]"
      >
        {isPending ? checkout.placing : checkout.submit}
      </Button>
    </form>
  );
}
