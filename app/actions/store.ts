"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "@/lib/payments/index";
import { getCurrentUserFeatureAccess } from "@/lib/auth/feature-access";
import { quoteCart } from "@/lib/store/quote-cart";
import type { QuoteCartResult } from "@/lib/store/quote-cart";
import { confirmStoreOrder as confirmStoreOrderCore } from "@/lib/store/confirm-store-order";
import type { ConfirmStoreOrderResult } from "@/lib/store/confirm-store-order";
import { finalizePaidOrder as finalizePaidOrderCore } from "@/lib/orders/finalize-paid-order";
import { sendOwnerEmail } from "@/lib/emails/send";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/i18n";

/**
 * Access is gated by the 'store' feature (public vs restricted, managed in
 * /admin/access). Both actions re-check it (defense in depth — they are
 * directly callable). When allowed, we still attach the signed-in user's id
 * (when present) so the order shows up in their account.
 */

export async function quoteStoreCart(
  items: unknown,
  locale: Locale,
): Promise<QuoteCartResult> {
  const { allowed } = await getCurrentUserFeatureAccess("store");
  if (!allowed) return { ok: false, message: "forbidden" };
  return quoteCart(items, locale, { admin: createAdminSupabaseClient() });
}

export async function confirmStoreOrder(input: {
  items: unknown;
  delivery: unknown;
  clientRequestId: string;
  locale: Locale;
}): Promise<ConfirmStoreOrderResult> {
  const access = await getCurrentUserFeatureAccess("store");
  if (!access.allowed) return { ok: false, message: "forbidden" };
  const user = access.user;

  const admin = createAdminSupabaseClient();
  const ownerOrderUrlFor = (id: string) => `${siteConfig.url}/he/admin/orders/${id}`;

  return confirmStoreOrderCore(input, {
    admin,
    paymentProvider: getPaymentProvider(),
    finalizePaidOrder: (fpInput) =>
      finalizePaidOrderCore(fpInput, {
        admin,
        sendOwnerEmail,
        ownerOrderUrlFor,
      }),
    redirectUrlFor: (gt, locale) => `${siteConfig.url}/${locale}/store/track/${gt}`,
    ipnUrl: `${siteConfig.url}/api/payments/icredit/ipn`,
    sendOwnerEmail,
    ownerOrderUrlFor,
    userId: user?.id ?? null,
  });
}
