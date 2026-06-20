import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../dictionaries";
import { StepIndicator } from "@/components/stickers/step-indicator";
import { CheckoutForm } from "@/components/stickers/checkout-form";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  const steps = [
    { key: "build", label: dict.stickers.steps.build },
    { key: "details", label: dict.stickers.steps.details },
    { key: "confirm", label: dict.stickers.steps.confirm },
  ];

  return (
    <Container>
      <div className="flex flex-col gap-8 py-10 pb-20 lg:pb-10">
        <StepIndicator steps={steps} current={1} />
        <h1 className="font-display text-3xl font-bold text-ink">
          {dict.stickers.checkout.heading}
        </h1>
        <CheckoutForm dict={dict.stickers} lang={lang} />
      </div>
    </Container>
  );
}
