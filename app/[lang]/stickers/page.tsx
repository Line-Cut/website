import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../dictionaries";
import { StickerTool } from "@/components/stickers/sticker-tool";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDraftForEdit } from "@/app/actions/stickers";

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
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { draft } = await searchParams;
  const initialDraft = user && draft ? await getDraftForEdit(draft) : null;

  return (
    <Container>
      <StickerTool dict={dict.stickers} lang={lang} isSignedIn={!!user} initialDraft={initialDraft} />
    </Container>
  );
}
