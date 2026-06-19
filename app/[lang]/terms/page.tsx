import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../dictionaries";

export default async function TermsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <Container className="max-w-3xl py-20">
      <h1 className="font-display text-3xl font-bold">{dict.legal.termsTitle}</h1>
      <p className="mt-4 whitespace-pre-line leading-relaxed text-muted">{dict.legal.termsBody}</p>
    </Container>
  );
}
