import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { OrderHistoryList } from "@/components/stickers/order-history-list";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../dictionaries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserOrders } from "@/lib/orders/order-view";

export const dynamic = "force-dynamic";

export default async function AccountOrdersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${lang}/login`);
  }

  const [dict, orders] = await Promise.all([
    getDictionary(lang),
    getUserOrders(lang),
  ]);

  return (
    <Container>
      <div className="flex flex-col gap-8 py-10">
        <h1 className="font-display text-3xl font-bold text-ink">
          {dict.stickers.account.ordersHeading}
        </h1>
        <OrderHistoryList
          orders={orders}
          dict={dict.stickers}
          locale={lang}
          lang={lang}
        />
      </div>
    </Container>
  );
}
