import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../dictionaries";
import { CartView } from "@/components/store/cart-view";

export default async function CartPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
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
