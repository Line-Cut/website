"use client";

import { useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import type { DraftListItem } from "@/lib/orders/draft-view";
import { discardDraft } from "@/app/actions/stickers";
import { interpolate } from "@/lib/stickers/format";
import { Button } from "@/components/ui/button";

export function DraftList({
  drafts,
  dict,
  lang,
}: {
  drafts: DraftListItem[];
  dict: Dictionary["stickers"];
  lang: Locale;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const d = dict.drafts;

  if (drafts.length === 0) {
    return <p className="text-sm text-muted">{d.empty}</p>;
  }

  function onDiscard(orderId: string) {
    if (!window.confirm(d.discardConfirm)) return;
    startTransition(async () => {
      await discardDraft(orderId);
      router.refresh();
    });
  }

  function onCheckout(orderId: string, guestToken: string) {
    sessionStorage.setItem("linecut_order", JSON.stringify({ orderId, guestToken }));
    router.push(`/${lang}/stickers/checkout`);
  }

  return (
    <ul className="flex flex-col gap-4">
      {drafts.map((draft) => (
        <li key={draft.orderId} className="flex items-center gap-4 rounded-md border border-line bg-paper p-4">
          {draft.thumbnailUrl && (
            <Image src={draft.thumbnailUrl} alt="" width={56} height={56} className="rounded object-cover" />
          )}
          <div className="flex-1">
            <p className="text-sm text-ink">
              {interpolate(d.stickerCount, { count: draft.stickerCount, copies: draft.copies })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/${lang}/stickers?draft=${draft.orderId}`}
              className="text-accent underline underline-offset-2 hover:text-accent/80"
            >
              {d.continueEditing}
            </Link>
            <Button type="button" variant="outline" onClick={() => onCheckout(draft.orderId, draft.guestToken)}>
              {d.continueCheckout}
            </Button>
            <Button type="button" variant="ghost" disabled={isPending} onClick={() => onDiscard(draft.orderId)}>
              {d.discard}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
