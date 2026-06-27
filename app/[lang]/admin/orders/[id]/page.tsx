import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../../dictionaries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-access";
import { getOrderAdmin } from "@/app/actions/admin-orders";
import { formatMoney } from "@/lib/stickers/format";
import { AdminOrderItems } from "@/components/admin/admin-order-items";
import { OrderStatusControl } from "@/components/admin/order-status-control";
import { PaymentStatusControl } from "@/components/admin/payment-status-control";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="text-end text-ink">{children}</span>
    </div>
  );
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();

  // Owner gate — mirrors the existing /files route.
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdmin(user ? { id: user.id, email: user.email } : null))) redirect(`/${lang}/login`);

  const dict = await getDictionary(lang);
  const o = dict.admin.orders;

  const detail = await getOrderAdmin(id, lang);
  if (!detail) notFound();

  const bcp47 = lang === "he" ? "he-IL" : "en-IL";
  const fmtDateTime = (iso: string) =>
    new Intl.DateTimeFormat(bcp47, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

  const d = detail.delivery;
  const checkout = dict.stickers.checkout;
  const kindLabel =
    detail.kind === "stickers" ? o.kindStickers : o.kindStore;
  const methodLabel =
    d.method === "shipping" ? checkout.methodShipping : checkout.methodPickup;
  const paidAt = detail.paidAtISO ? fmtDateTime(detail.paidAtISO) : null;

  return (
    <Container>
      <div className="flex flex-col gap-8 py-10">
        {/* Back link */}
        <Link
          href={`/${lang}/admin/orders`}
          className="w-fit text-sm font-medium text-accent underline-offset-2 hover:underline"
        >
          {o.backToList}
        </Link>

        {/* Header */}
        <div className="flex flex-col gap-2 border-b border-line pb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-ink">
              {o.order}
            </h1>
            <span className="inline-flex items-center rounded-full border border-line bg-paper-2 px-2.5 py-0.5 text-xs font-medium text-ink">
              {kindLabel}
            </span>
          </div>
          <p dir="ltr" className="break-all font-mono text-sm text-muted">
            {detail.orderId}
          </p>
          <p className="text-sm text-muted">{fmtDateTime(detail.createdAtISO)}</p>
        </div>

        {/* Contact + delivery */}
        <div className="grid gap-6 sm:grid-cols-2">
          <Section title={o.contact}>
            <div className="flex flex-col gap-1 text-sm text-ink">
              <span className="font-medium">
                {d.firstName} {d.lastName}
              </span>
              {d.phone && <span dir="ltr">{d.phone}</span>}
              <span dir="ltr">{d.email}</span>
            </div>
          </Section>

          <Section title={o.delivery}>
            <div className="flex flex-col gap-1 text-sm text-ink">
              <span className="font-medium">{methodLabel}</span>
              {d.method === "shipping" && (
                <>
                  {d.addressLine1 && <span>{d.addressLine1}</span>}
                  {d.addressLine2 && <span>{d.addressLine2}</span>}
                  {d.city && <span>{d.city}</span>}
                  {d.postalCode && <span dir="ltr">{d.postalCode}</span>}
                  {d.country && <span>{d.country}</span>}
                </>
              )}
              {d.notes && <span className="text-muted">{d.notes}</span>}
            </div>
          </Section>
        </div>

        {/* Items */}
        <Section title={o.items}>
          {detail.kind === "store" ? (
            <AdminOrderItems
              items={detail.items}
              currency={detail.currency}
              lang={lang}
            />
          ) : (
            <div className="flex items-center justify-between gap-4">
              <span className="tabular-nums text-sm font-medium text-ink">
                {detail.stickerCount}
              </span>
              <Link
                href={`/${lang}/admin/orders/${detail.orderId}/files`}
                className="text-sm font-medium text-accent underline-offset-2 hover:underline"
              >
                {o.viewFiles}
              </Link>
            </div>
          )}
        </Section>

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg border border-line bg-paper-2 px-5 py-4">
          <span className="font-semibold text-ink">{o.total}</span>
          <span
            dir="ltr"
            className="font-display text-lg font-bold tabular-nums text-ink"
          >
            {formatMoney(detail.total, detail.currency, lang)}
          </span>
        </div>

        {/* Payment */}
        <Section title={o.payment}>
          <div className="flex flex-col gap-3 text-sm">
            <Row label={o.status}>
              <span className="inline-flex items-center rounded-full border border-line bg-paper-2 px-2.5 py-0.5 text-xs font-medium text-ink">
                {detail.paymentStatus.replace(/_/g, " ")}
              </span>
            </Row>
            <Row label={o.paymentReference}>
              <span dir="ltr">{detail.paymentReference || "—"}</span>
            </Row>
            <Row label={o.paidAt}>
              <span dir="ltr">{paidAt ?? "—"}</span>
            </Row>
            <Row label={o.receipt}>
              <span className="text-muted">
                {detail.hasReceipt ? o.viewReceipt : o.noReceipt}
              </span>
            </Row>
          </div>
        </Section>

        {/* Controls */}
        <div className="flex flex-col gap-6 border-t border-line pt-6">
          <OrderStatusControl
            orderId={detail.orderId}
            current={detail.status}
            statusDict={dict.stickers.status}
            dict={o}
          />
          <PaymentStatusControl
            orderId={detail.orderId}
            current={detail.paymentStatus}
            reference={detail.paymentReference}
            dict={o}
          />
        </div>
      </div>
    </Container>
  );
}
