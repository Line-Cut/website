import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../dictionaries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-access";
import { listAdmins } from "@/app/actions/admins";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminsManager } from "@/components/admin/admins-manager";

export const dynamic = "force-dynamic";

export default async function AdminsPage({
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
  if (!(await isAdmin(user ? { id: user.id, email: user.email } : null))) {
    redirect(`/${lang}/login`);
  }

  const dict = await getDictionary(lang);
  const admins = await listAdmins();

  return (
    <Container>
      <div className="flex flex-col gap-6 py-10">
        <AdminNav lang={lang} dict={dict.admin.nav} current="admins" />
        <h1 className="font-display text-2xl font-bold text-ink">
          {dict.admin.admins.heading}
        </h1>
        <AdminsManager admins={admins} dict={dict.admin.admins} lang={lang} />
      </div>
    </Container>
  );
}
