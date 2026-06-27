import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../dictionaries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-access";
import { listProductsAdmin } from "@/app/actions/products";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { AdminNav } from "@/components/admin/admin-nav";
import { ProductAdminList } from "@/components/admin/product-admin-list";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
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
  const products = await listProductsAdmin();

  return (
    <Container className="py-12">
      <div className="mb-6">
        <AdminNav lang={lang} dict={dict.admin.nav} current="products" />
      </div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-ink">{t.heading}</h1>
        <Button asChild variant="primary" size="sm">
          <Link href={`/${lang}/admin/products/new`}>{t.new}</Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <p className="rounded-md border border-line bg-paper p-6 text-muted">
          {t.empty}
        </p>
      ) : (
        <ProductAdminList products={products} dict={t} lang={lang} />
      )}
    </Container>
  );
}
