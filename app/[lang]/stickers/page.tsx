import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../dictionaries";
import { StickerTool } from "@/components/stickers/sticker-tool";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isStickerShopUser, isStickerShopRestricted } from "@/lib/auth/sticker-access";

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

  // While restricted, only allow-listed accounts may access the shop.
  // Guests are sent to sign in; signed-in-but-not-allowed users go home.
  // (STICKER_SHOP_PUBLIC opens it to everyone — no redirect.)
  if (isStickerShopRestricted() && !isStickerShopUser(user?.email)) {
    redirect(user ? `/${lang}` : `/${lang}/login`);
  }

  return (
    <Container>
      <StickerTool dict={dict.stickers} lang={lang} />
    </Container>
  );
}
