import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../dictionaries";
import { getProductBySlug } from "@/lib/store/product-view";
import { ProductDetail } from "@/components/store/product-detail";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isFeatureAllowed } from "@/lib/auth/feature-access";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const product = await getProductBySlug(slug, lang);
  if (!product) return {};
  return {
    title: `${product.title} — Line Cut`,
    description: product.description || undefined,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isFeatureAllowed("store", user ? { id: user.id, email: user.email } : null))) {
    redirect(user ? `/${lang}` : `/${lang}/login`);
  }
  const dict = await getDictionary(lang);
  const product = await getProductBySlug(slug, lang);
  if (!product) notFound();

  return (
    <Container>
      <div className="flex flex-col gap-6 py-10">
        <Link
          href={`/${lang}/store`}
          className="text-sm font-medium text-accent underline underline-offset-2 hover:text-accent/80"
        >
          {dict.store.backToStore}
        </Link>
        <ProductDetail product={product} dict={dict.store} lang={lang} />
      </div>
    </Container>
  );
}
