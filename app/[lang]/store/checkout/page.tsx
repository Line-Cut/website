import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../dictionaries";
import { StoreCheckout } from "@/components/store/store-checkout";

export const dynamic = "force-dynamic";

export default async function StoreCheckoutPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <Container>
      <div className="flex flex-col gap-6 py-10">
        <h1 className="font-display text-3xl font-bold text-ink">
          {dict.store.checkout.heading}
        </h1>
        <StoreCheckout dict={dict.store} lang={lang} />
      </div>
    </Container>
  );
}
