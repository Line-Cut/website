import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../dictionaries";
import { StickerTool } from "@/components/stickers/sticker-tool";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isFeatureAllowed } from "@/lib/auth/feature-access";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    title: dict.stickers.meta.title,
    description: dict.stickers.meta.description,
  };
}

export default async function StickersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Gated by the 'stickers' feature: public ⇒ everyone; restricted ⇒ allow-listed
  // signed-in users (admins always pass). Guests → login, others → home.
  const allowed = await isFeatureAllowed(
    "stickers",
    user ? { id: user.id, email: user.email } : null,
  );
  if (!allowed) {
    redirect(user ? `/${lang}` : `/${lang}/login`);
  }

  return (
    <Container>
      <StickerTool dict={dict.stickers} lang={lang} />
    </Container>
  );
}
