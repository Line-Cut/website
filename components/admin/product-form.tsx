"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import type { Product, ProductStatus } from "@/lib/store/types";
import {
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/app/actions/products";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/admin/image-upload";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type ChoiceState = {
  value: string;
  labelHe: string;
  labelEn: string;
  priceDelta: string; // agorot, kept as string while editing
};

type OptionState = {
  key: string;
  labelHe: string;
  labelEn: string;
  choices: ChoiceState[];
};

type FormState = {
  slug: string;
  status: ProductStatus;
  titleHe: string;
  titleEn: string;
  descriptionHe: string;
  descriptionEn: string;
  price: string; // agorot, kept as string while editing
  currency: string;
  imageUrl: string | null;
  sortIndex: string;
  options: OptionState[];
};

type Props =
  | { mode: "create"; dict: Dictionary["admin"]["products"]; lang: Locale }
  | {
      mode: "edit";
      product: Product;
      dict: Dictionary["admin"]["products"];
      lang: Locale;
    };

const INPUT_CLASS =
  "h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent";
const TEXTAREA_CLASS =
  "rounded-md border border-line bg-paper px-3 py-2 outline-none focus:border-accent";

function emptyChoice(): ChoiceState {
  return { value: "", labelHe: "", labelEn: "", priceDelta: "0" };
}

function emptyOption(): OptionState {
  return { key: "", labelHe: "", labelEn: "", choices: [emptyChoice()] };
}

function toInt(value: string): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function initialState(product?: Product): FormState {
  if (!product) {
    return {
      slug: "",
      status: "draft",
      titleHe: "",
      titleEn: "",
      descriptionHe: "",
      descriptionEn: "",
      price: "0",
      currency: "ILS",
      imageUrl: null,
      sortIndex: "0",
      options: [],
    };
  }
  return {
    slug: product.slug,
    status: product.status,
    titleHe: product.titleHe,
    titleEn: product.titleEn,
    descriptionHe: product.descriptionHe,
    descriptionEn: product.descriptionEn,
    price: String(product.price),
    currency: product.currency,
    imageUrl: product.imageUrl,
    sortIndex: String(product.sortIndex),
    options: product.options.map((o) => ({
      key: o.key,
      labelHe: o.labelHe,
      labelEn: o.labelEn,
      choices: o.choices.map((c) => ({
        value: c.value,
        labelHe: c.labelHe,
        labelEn: c.labelEn,
        priceDelta: String(c.priceDelta),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductForm(props: Props) {
  const { dict, lang, mode } = props;
  const product = mode === "edit" ? props.product : undefined;
  const router = useRouter();

  const [form, setForm] = useState<FormState>(() => initialState(product));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [genericError, setGenericError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function errText(field: string): string | null {
    const code = fieldErrors[field];
    if (!code) return null;
    const errs = dict.errors as Record<string, string>;
    return errs[code] ?? dict.errors.serverError;
  }

  // --- Options editor -------------------------------------------------------

  function updateOptions(next: OptionState[]) {
    set("options", next);
  }

  function setOption(index: number, patch: Partial<OptionState>) {
    updateOptions(
      form.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    );
  }

  function setChoice(
    optIndex: number,
    choiceIndex: number,
    patch: Partial<ChoiceState>,
  ) {
    setOption(optIndex, {
      choices: form.options[optIndex].choices.map((c, i) =>
        i === choiceIndex ? { ...c, ...patch } : c,
      ),
    });
  }

  // --- Submit ---------------------------------------------------------------

  function buildInput() {
    return {
      slug: form.slug.trim(),
      status: form.status,
      titleHe: form.titleHe,
      titleEn: form.titleEn,
      descriptionHe: form.descriptionHe,
      descriptionEn: form.descriptionEn,
      price: toInt(form.price),
      currency: form.currency.trim() || "ILS",
      imageUrl: form.imageUrl,
      // No gallery editor yet: the gallery mirrors the primary image.
      images: form.imageUrl ? [{ url: form.imageUrl, sortIndex: 0 }] : [],
      options: form.options.map((o) => ({
        key: o.key.trim(),
        labelHe: o.labelHe,
        labelEn: o.labelEn,
        choices: o.choices.map((c) => ({
          value: c.value,
          labelHe: c.labelHe,
          labelEn: c.labelEn,
          priceDelta: toInt(c.priceDelta),
        })),
      })),
      sortIndex: toInt(form.sortIndex),
    };
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;
    setFieldErrors({});
    setGenericError(null);

    const input = buildInput();
    startTransition(async () => {
      const result =
        mode === "edit"
          ? await updateProduct(product!.id, input)
          : await createProduct(input);

      if (result.ok) {
        // Navigate to the list. Do NOT also call router.refresh() here: after a
        // Server Action, refresh() right after push() inside the transition
        // deadlocks the navigation — it never commits, so isPending stays true
        // and the button is stuck on "saving" forever (the write still lands).
        // The list is force-dynamic, so push() already loads fresh data.
        router.push(`/${lang}/admin/products`);
      } else if (result.errors) {
        setFieldErrors(result.errors);
      } else {
        setGenericError(dict.errors.serverError);
      }
    });
  }

  function handleDelete() {
    if (mode !== "edit" || isPending) return;
    if (!window.confirm(dict.deleteConfirm)) return;
    setGenericError(null);
    startTransition(async () => {
      const result = await deleteProduct(product!.id);
      if (result.ok) {
        // See handleSubmit: push() only — a trailing refresh() deadlocks the
        // post-action navigation and hangs the button.
        router.push(`/${lang}/admin/products`);
      } else {
        setGenericError(dict.errors.serverError);
      }
    });
  }

  // --- Render ---------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {genericError && (
        <div
          role="alert"
          className="rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent"
        >
          {genericError}
        </div>
      )}

      {/* Titles */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={dict.titleHe} htmlFor="titleHe" error={errText("titleHe")}>
          <input
            id="titleHe"
            type="text"
            value={form.titleHe}
            onChange={(e) => set("titleHe", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label={dict.titleEn} htmlFor="titleEn" error={errText("titleEn")}>
          <input
            id="titleEn"
            type="text"
            dir="ltr"
            value={form.titleEn}
            onChange={(e) => set("titleEn", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      {/* Descriptions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={dict.descriptionHe}
          htmlFor="descriptionHe"
          error={errText("descriptionHe")}
        >
          <textarea
            id="descriptionHe"
            rows={4}
            value={form.descriptionHe}
            onChange={(e) => set("descriptionHe", e.target.value)}
            className={TEXTAREA_CLASS}
          />
        </Field>
        <Field
          label={dict.descriptionEn}
          htmlFor="descriptionEn"
          error={errText("descriptionEn")}
        >
          <textarea
            id="descriptionEn"
            rows={4}
            dir="ltr"
            value={form.descriptionEn}
            onChange={(e) => set("descriptionEn", e.target.value)}
            className={TEXTAREA_CLASS}
          />
        </Field>
      </div>

      {/* Slug + status */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={dict.slug} htmlFor="slug" error={errText("slug")}>
          <input
            id="slug"
            type="text"
            dir="ltr"
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label={dict.status} htmlFor="status" error={errText("status")}>
          <select
            id="status"
            value={form.status}
            onChange={(e) => set("status", e.target.value as ProductStatus)}
            className={INPUT_CLASS}
          >
            <option value="draft">{dict.statusDraft}</option>
            <option value="active">{dict.statusActive}</option>
            <option value="archived">{dict.statusArchived}</option>
          </select>
        </Field>
      </div>

      {/* Price + currency + sort */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={dict.price} htmlFor="price" error={errText("price")}>
          <input
            id="price"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            dir="ltr"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label={dict.currency} htmlFor="currency" error={errText("currency")}>
          <input
            id="currency"
            type="text"
            dir="ltr"
            value={form.currency}
            onChange={(e) => set("currency", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field
          label={dict.sortIndex}
          htmlFor="sortIndex"
          error={errText("sortIndex")}
        >
          <input
            id="sortIndex"
            type="number"
            inputMode="numeric"
            step={1}
            dir="ltr"
            value={form.sortIndex}
            onChange={(e) => set("sortIndex", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      {/* Primary image */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">{dict.image}</span>
        <ImageUpload
          value={form.imageUrl}
          onChange={(url) => set("imageUrl", url)}
          dict={dict}
        />
        {errText("imageUrl") && (
          <span role="alert" className="text-xs text-accent">
            {errText("imageUrl")}
          </span>
        )}
      </div>

      {/* Options editor */}
      <fieldset className="flex flex-col gap-4 rounded-md border border-line bg-paper-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium text-ink">{dict.options}</legend>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => updateOptions([...form.options, emptyOption()])}
          >
            {dict.addOption}
          </Button>
        </div>

        {errText("options") && (
          <span role="alert" className="text-xs text-accent">
            {errText("options")}
          </span>
        )}

        {form.options.map((option, optIndex) => (
          <div
            key={optIndex}
            className="flex flex-col gap-3 rounded-md border border-line bg-paper p-3"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={dict.optionKey} htmlFor={`opt-${optIndex}-key`}>
                <input
                  id={`opt-${optIndex}-key`}
                  type="text"
                  dir="ltr"
                  value={option.key}
                  onChange={(e) => setOption(optIndex, { key: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field
                label={dict.optionLabelHe}
                htmlFor={`opt-${optIndex}-labelHe`}
              >
                <input
                  id={`opt-${optIndex}-labelHe`}
                  type="text"
                  value={option.labelHe}
                  onChange={(e) => setOption(optIndex, { labelHe: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field
                label={dict.optionLabelEn}
                htmlFor={`opt-${optIndex}-labelEn`}
              >
                <input
                  id={`opt-${optIndex}-labelEn`}
                  type="text"
                  dir="ltr"
                  value={option.labelEn}
                  onChange={(e) => setOption(optIndex, { labelEn: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            {/* Choices */}
            <div className="flex flex-col gap-3">
              {option.choices.map((choice, choiceIndex) => (
                <div
                  key={choiceIndex}
                  className="grid gap-2 rounded-md border border-line bg-paper-2 p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end"
                >
                  <Field
                    label={dict.choiceValue}
                    htmlFor={`opt-${optIndex}-ch-${choiceIndex}-value`}
                  >
                    <input
                      id={`opt-${optIndex}-ch-${choiceIndex}-value`}
                      type="text"
                      dir="ltr"
                      value={choice.value}
                      onChange={(e) =>
                        setChoice(optIndex, choiceIndex, { value: e.target.value })
                      }
                      className={INPUT_CLASS}
                    />
                  </Field>
                  <Field
                    label={dict.choiceLabelHe}
                    htmlFor={`opt-${optIndex}-ch-${choiceIndex}-labelHe`}
                  >
                    <input
                      id={`opt-${optIndex}-ch-${choiceIndex}-labelHe`}
                      type="text"
                      value={choice.labelHe}
                      onChange={(e) =>
                        setChoice(optIndex, choiceIndex, { labelHe: e.target.value })
                      }
                      className={INPUT_CLASS}
                    />
                  </Field>
                  <Field
                    label={dict.choiceLabelEn}
                    htmlFor={`opt-${optIndex}-ch-${choiceIndex}-labelEn`}
                  >
                    <input
                      id={`opt-${optIndex}-ch-${choiceIndex}-labelEn`}
                      type="text"
                      dir="ltr"
                      value={choice.labelEn}
                      onChange={(e) =>
                        setChoice(optIndex, choiceIndex, { labelEn: e.target.value })
                      }
                      className={INPUT_CLASS}
                    />
                  </Field>
                  <Field
                    label={dict.priceDelta}
                    htmlFor={`opt-${optIndex}-ch-${choiceIndex}-priceDelta`}
                  >
                    <input
                      id={`opt-${optIndex}-ch-${choiceIndex}-priceDelta`}
                      type="number"
                      inputMode="numeric"
                      step={1}
                      dir="ltr"
                      value={choice.priceDelta}
                      onChange={(e) =>
                        setChoice(optIndex, choiceIndex, {
                          priceDelta: e.target.value,
                        })
                      }
                      className={INPUT_CLASS}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={option.choices.length === 1}
                    onClick={() =>
                      setOption(optIndex, {
                        choices: option.choices.filter(
                          (_, i) => i !== choiceIndex,
                        ),
                      })
                    }
                  >
                    {dict.removeOption}
                  </Button>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setOption(optIndex, {
                      choices: [...option.choices, emptyChoice()],
                    })
                  }
                >
                  {dict.addChoice}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    updateOptions(form.options.filter((_, i) => i !== optIndex))
                  }
                >
                  {dict.removeOption}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </fieldset>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? dict.saving : mode === "edit" ? dict.save : dict.create}
        </Button>
        {mode === "edit" && (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={handleDelete}
          >
            {dict.delete}
          </Button>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Field — label + control + inline error
// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error && (
        <span role="alert" className="text-xs text-accent">
          {error}
        </span>
      )}
    </div>
  );
}
