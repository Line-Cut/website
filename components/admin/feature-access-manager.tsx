"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  setFeatureVisibility,
  addFeatureAllowedUser,
  removeFeatureAllowedUser,
  type FeatureAccessView,
} from "@/app/actions/feature-access";
import { interpolate } from "@/lib/stickers/format";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

export function FeatureAccessManager({
  features,
  dict,
  lang,
}: {
  features: FeatureAccessView[];
  dict: Dictionary["admin"]["access"];
  lang: Locale;
}) {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted">{dict.description}</p>
      {features.map((f) => (
        <FeatureCard key={f.feature} feature={f} dict={dict} lang={lang} />
      ))}
    </div>
  );
}

function FeatureCard({
  feature,
  dict,
  lang,
}: {
  feature: FeatureAccessView;
  dict: Dictionary["admin"]["access"];
  lang: Locale;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bcp47 = lang === "he" ? "he-IL" : "en-IL";
  const restricted = feature.visibility === "restricted";

  function showError(code?: string) {
    setError(dict.errors[code as keyof typeof dict.errors] ?? dict.errors.serverError);
  }

  function handleSetVisibility(visibility: "public" | "restricted") {
    if (isPending || visibility === feature.visibility) return;
    setError(null);
    startTransition(async () => {
      const res = await setFeatureVisibility(feature.feature, visibility);
      if (res.ok) router.refresh();
      else showError(res.message);
    });
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending || !email.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addFeatureAllowedUser(feature.feature, email.trim());
      if (res.ok) {
        setEmail("");
        router.refresh();
      } else {
        showError(res.message);
      }
    });
  }

  function handleRemove(userId: string) {
    if (isPending) return;
    if (!window.confirm(dict.removeConfirm)) return;
    setError(null);
    startTransition(async () => {
      const res = await removeFeatureAllowedUser(feature.feature, userId);
      if (res.ok) router.refresh();
      else showError(res.message);
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-ink">
          {dict.features[feature.feature]}
        </h2>
        <div className="inline-flex overflow-hidden rounded-md border border-line" role="group">
          {(["public", "restricted"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => handleSetVisibility(v)}
              disabled={isPending}
              aria-pressed={feature.visibility === v}
              className={`px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                feature.visibility === v ? "bg-ink text-paper" : "text-ink hover:bg-paper-2"
              }`}
            >
              {dict.visibility[v]}
            </button>
          ))}
        </div>
      </div>

      {!restricted ? (
        <p className="text-sm text-muted">{dict.publicNote}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{dict.restrictedNote}</p>

          <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor={`allow-${feature.feature}`} className="text-sm font-medium text-ink">
                {dict.addByEmail}
              </label>
              <input
                id={`allow-${feature.feature}`}
                type="email"
                dir="ltr"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={dict.emailPlaceholder}
                className="h-11 rounded-md border border-line bg-paper px-3 outline-none focus:border-accent"
              />
            </div>
            <Button type="submit" variant="primary" disabled={isPending} className="min-h-[44px]">
              {isPending ? dict.adding : dict.add}
            </Button>
          </form>

          {feature.allowed.length === 0 ? (
            <p className="text-muted">{dict.empty}</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {feature.allowed.map((u) => (
                <li key={u.userId} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p dir="ltr" className="truncate font-medium text-ink">
                      {u.email}
                    </p>
                    <p className="text-xs text-muted">
                      {interpolate(dict.addedOn, {
                        date: new Intl.DateTimeFormat(bcp47).format(new Date(u.createdAtISO)),
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(u.userId)}
                    disabled={isPending}
                    className="shrink-0 text-muted hover:text-accent disabled:opacity-50"
                    aria-label={dict.remove}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}
    </section>
  );
}
