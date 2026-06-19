import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../dictionaries";

export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <Container className="prose max-w-3xl py-20">
      <h1 className="font-display text-3xl font-bold">{dict.legal.privacyTitle}</h1>
      <p className="mt-4 whitespace-pre-line text-muted">{dict.legal.privacyBody}</p>
    </Container>
  );
}
