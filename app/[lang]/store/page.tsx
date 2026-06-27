import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../dictionaries";
import { listActiveProducts } from "@/lib/store/product-view";
import { ProductGrid } from "@/components/store/product-grid";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return { title: dict.store.meta.title, description: dict.store.meta.description };
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const products = await listActiveProducts(lang);

  return (
    <Container>
      <div className="flex flex-col gap-8 py-12">
        <Reveal className="max-w-2xl">
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
            {dict.store.heading}
          </h1>
          <p className="mt-3 text-lg text-muted">{dict.store.intro}</p>
        </Reveal>
        <ProductGrid products={products} dict={dict.store} lang={lang} />
      </div>
    </Container>
  );
}
