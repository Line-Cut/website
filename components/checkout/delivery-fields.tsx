"use client";

import type { RefCallback } from "react";

export type DeliveryValues = {
  method: "pickup" | "shipping";
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
  notes: string;
};

export const emptyDelivery: DeliveryValues = {
  method: "pickup",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  country: "",
  notes: "",
};

type Labels = {
  heading: string;
  methodPickup: string;
  methodShipping: string;
  fields: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    postalCode: string;
    country: string;
    notes: string;
  };
};

type FieldErrorLabels = {
  required: string;
  invalid_email: string;
  invalid_phone: string;
};

type Props = {
  values: DeliveryValues;
  errors: Record<string, string>;
  onChange: (field: keyof DeliveryValues, value: string) => void;
  onBlur: (field: keyof DeliveryValues) => void;
  setFieldRef?: (name: string) => RefCallback<HTMLInputElement>;
  labels: Labels;
  fieldErrorLabels: FieldErrorLabels;
};

const inputClass =
  "h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent";

/**
 * Shared delivery + contact fields (pickup vs shipping with progressive
 * disclosure). Validation is the caller's job (parseCheckout); this is
 * presentational. Keep field ids/labels stable across the sticker + store flows.
 */
export function DeliveryFields({
  values,
  errors,
  onChange,
  onBlur,
  setFieldRef,
  labels,
  fieldErrorLabels,
}: Props) {
  const isShipping = values.method === "shipping";

  function errorText(field: string): string | null {
    const code = errors[field];
    if (!code) return null;
    return fieldErrorLabels[code as keyof FieldErrorLabels] ?? code;
  }

  function TextField({
    field,
    label,
    type = "text",
    autoComplete,
    ltr = false,
    validateOnBlur = true,
  }: {
    field: keyof DeliveryValues;
    label: string;
    type?: string;
    autoComplete?: string;
    ltr?: boolean;
    validateOnBlur?: boolean;
  }) {
    const err = errorText(field);
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={field} className="text-sm font-medium text-ink">
          {label}
        </label>
        <input
          id={field}
          type={type}
          dir={ltr ? "ltr" : undefined}
          autoComplete={autoComplete}
          value={values[field]}
          onChange={(e) => onChange(field, e.target.value)}
          onBlur={validateOnBlur ? () => onBlur(field) : undefined}
          ref={setFieldRef ? setFieldRef(field) : undefined}
          aria-invalid={Boolean(err)}
          aria-describedby={err ? `err-${field}` : undefined}
          className={inputClass}
        />
        {err && (
          <span id={`err-${field}`} aria-live="polite" className="text-xs text-accent">
            {err}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">{labels.heading}</legend>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name="method"
            value="pickup"
            checked={values.method === "pickup"}
            onChange={() => onChange("method", "pickup")}
            className="accent-accent"
          />
          {labels.methodPickup}
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name="method"
            value="shipping"
            checked={isShipping}
            onChange={() => onChange("method", "shipping")}
            className="accent-accent"
          />
          {labels.methodShipping}
        </label>
      </fieldset>

      <TextField field="firstName" label={labels.fields.firstName} autoComplete="given-name" />
      <TextField field="lastName" label={labels.fields.lastName} autoComplete="family-name" />
      <TextField field="phone" label={labels.fields.phone} type="tel" autoComplete="tel" ltr />
      <TextField field="email" label={labels.fields.email} type="email" autoComplete="email" ltr />

      {isShipping && (
        <>
          <TextField field="addressLine1" label={labels.fields.addressLine1} autoComplete="address-line1" />
          <TextField
            field="addressLine2"
            label={labels.fields.addressLine2}
            autoComplete="address-line2"
            validateOnBlur={false}
          />
          <TextField field="city" label={labels.fields.city} autoComplete="address-level2" />
          <TextField field="postalCode" label={labels.fields.postalCode} autoComplete="postal-code" ltr />
          <TextField
            field="country"
            label={labels.fields.country}
            autoComplete="country-name"
            validateOnBlur={false}
          />
        </>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium text-ink">
          {labels.fields.notes}
        </label>
        <textarea
          id="notes"
          rows={3}
          value={values.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          className="rounded-md border border-line bg-paper px-3 py-2 outline-none focus:border-accent"
        />
      </div>
    </>
  );
}
