import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../dictionaries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-access";
import { listOrdersAdmin } from "@/app/actions/admin-orders";
import { ORDER_STATUSES } from "@/lib/orders/admin-types";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminOrderTable } from "@/components/admin/admin-order-table";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams?: Promise<{ status?: string; kind?: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  // Owner gate — mirrors the existing /files route.
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdmin(user ? { id: user.id, email: user.email } : null))) redirect(`/${lang}/login`);

  const dict = await getDictionary(lang);
  const o = dict.admin.orders;

  const sp = (await searchParams) ?? {};
  const status = sp.status;
  const kind = sp.kind;

  const orders = await listOrdersAdmin({ status, kind });

  // Build a filter href that preserves the other active param.
  function buildHref(next: { status?: string; kind?: string }): string {
    const p = new URLSearchParams();
    const s = "status" in next ? next.status : status;
    const k = "kind" in next ? next.kind : kind;
    if (s) p.set("status", s);
    if (k) p.set("kind", k);
    const qs = p.toString();
    return `/${lang}/admin/orders${qs ? `?${qs}` : ""}`;
  }

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${
      active
        ? "border-accent bg-accent text-paper"
        : "border-line bg-paper text-muted hover:border-ink/40 hover:text-ink"
    }`;

  return (
    <Container>
      <div className="flex flex-col gap-6 py-10">
        <AdminNav lang={lang} dict={dict.admin.nav} current="orders" />
        <h1 className="font-display text-3xl font-bold text-ink">{o.heading}</h1>

        {/* Status filter */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {o.filterStatus}
          </span>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ status: undefined })}
              className={chipClass(!status)}
            >
              {o.all}
            </Link>
            {ORDER_STATUSES.map((s) => (
              <Link
                key={s}
                href={buildHref({ status: s })}
                className={chipClass(status === s)}
              >
                {dict.stickers.status[s]}
              </Link>
            ))}
          </div>
        </div>

        {/* Kind filter */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {o.filterKind}
          </span>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ kind: undefined })}
              className={chipClass(!kind)}
            >
              {o.all}
            </Link>
            <Link
              href={buildHref({ kind: "stickers" })}
              className={chipClass(kind === "stickers")}
            >
              {o.kindStickers}
            </Link>
            <Link
              href={buildHref({ kind: "store" })}
              className={chipClass(kind === "store")}
            >
              {o.kindStore}
            </Link>
          </div>
        </div>

        <AdminOrderTable
          orders={orders}
          dict={o}
          statusDict={dict.stickers.status}
          lang={lang}
        />
      </div>
    </Container>
  );
}
