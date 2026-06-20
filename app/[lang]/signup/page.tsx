import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { AuthForm } from "@/components/auth/auth-form";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../dictionaries";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <Container>
      <div className="mx-auto max-w-md py-16">
        <AuthForm mode="signup" lang={lang} dict={dict.auth} />
      </div>
    </Container>
  );
}
