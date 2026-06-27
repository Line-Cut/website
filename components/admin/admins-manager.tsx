"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { grantAdmin, revokeAdmin, type AdminUser } from "@/app/actions/admins";
import { interpolate } from "@/lib/stickers/format";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

export function AdminsManager({
  admins,
  dict,
  lang,
}: {
  admins: AdminUser[];
  dict: Dictionary["admin"]["admins"];
  lang: Locale;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bcp47 = lang === "he" ? "he-IL" : "en-IL";

  function showError(code?: string) {
    setError(dict.errors[code as keyof typeof dict.errors] ?? dict.errors.serverError);
  }

  function handleGrant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending || !email.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await grantAdmin(email.trim());
      if (res.ok) {
        setEmail("");
        router.refresh();
      } else {
        showError(res.message);
      }
    });
  }

  function handleRevoke(userId: string) {
    if (isPending) return;
    if (!window.confirm(dict.removeConfirm)) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeAdmin(userId);
      if (res.ok) router.refresh();
      else showError(res.message);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">{dict.description}</p>

      <form onSubmit={handleGrant} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="admin-email" className="text-sm font-medium text-ink">
            {dict.addByEmail}
          </label>
          <input
            id="admin-email"
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
          {isPending ? dict.granting : dict.grant}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      {admins.length === 0 ? (
        <p className="text-muted">{dict.empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {admins.map((a) => (
            <li key={a.userId} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p dir="ltr" className="truncate font-medium text-ink">
                  {a.email}
                </p>
                <p className="text-xs text-muted">
                  {interpolate(dict.grantedOn, {
                    date: new Intl.DateTimeFormat(bcp47).format(new Date(a.createdAtISO)),
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(a.userId)}
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

      <p className="text-xs text-muted">{dict.bootstrapNote}</p>
    </div>
  );
}
