import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../../dictionaries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-access";
import { Container } from "@/components/layout/container";
import { ProductForm } from "@/components/admin/product-form";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
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
  if (!(await isAdmin(user ? { id: user.id, email: user.email } : null))) redirect(`/${lang}/login`);

  const dict = await getDictionary(lang);
  const t = dict.admin.products;

  return (
    <Container className="py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-ink">{t.new}</h1>
        <Link
          href={`/${lang}/admin/products`}
          className="text-sm text-accent underline underline-offset-2 hover:text-accent/80"
        >
          {t.backToList}
        </Link>
      </div>

      <ProductForm mode="create" dict={t} lang={lang} />
    </Container>
  );
}
