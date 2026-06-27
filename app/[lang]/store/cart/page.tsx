import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../dictionaries";
import { CartView } from "@/components/store/cart-view";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isFeatureAllowed } from "@/lib/auth/feature-access";

export default async function CartPage({
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
  if (!(await isFeatureAllowed("store", user ? { id: user.id, email: user.email } : null))) {
    redirect(user ? `/${lang}` : `/${lang}/login`);
  }
  const dict = await getDictionary(lang);

  return (
    <Container>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 py-10">
        <h1 className="font-display text-3xl font-bold text-ink">{dict.store.cart.heading}</h1>
        <CartView dict={dict.store} lang={lang} />
      </div>
    </Container>
  );
}
