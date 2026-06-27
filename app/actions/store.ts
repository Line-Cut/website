"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments/index";
import { quoteCart } from "@/lib/store/quote-cart";
import type { QuoteCartResult } from "@/lib/store/quote-cart";
import { confirmStoreOrder as confirmStoreOrderCore } from "@/lib/store/confirm-store-order";
import type { ConfirmStoreOrderResult } from "@/lib/store/confirm-store-order";
import { sendOwnerEmail } from "@/lib/emails/send";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/i18n";

/**
 * The store is PUBLIC — guests may quote and order. We still attach the
 * signed-in user's id when present so the order shows up in their account.
 */

export async function quoteStoreCart(
  items: unknown,
  locale: Locale,
): Promise<QuoteCartResult> {
  return quoteCart(items, locale, { admin: createAdminSupabaseClient() });
}

export async function confirmStoreOrder(input: {
  items: unknown;
  delivery: unknown;
  clientRequestId: string;
}): Promise<ConfirmStoreOrderResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return confirmStoreOrderCore(input, {
    admin: createAdminSupabaseClient(),
    paymentProvider: getPaymentProvider(),
    sendOwnerEmail,
    ownerOrderUrlFor: (id) => `${siteConfig.url}/he/admin/orders/${id}`,
    userId: user?.id ?? null,
  });
}
