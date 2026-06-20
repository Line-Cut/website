import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../../dictionaries";
import { getOrderByToken } from "@/lib/orders/order-view";
import { OrderReceipt } from "@/components/stickers/order-receipt";
import { StepIndicator } from "@/components/stickers/step-indicator";

export const dynamic = "force-dynamic";

export default async function TrackPage({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}) {
  const { lang, token } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  const order = await getOrderByToken(token);

  if (!order) {
    return (
      <Container>
        <div className="py-10">
          <p className="text-base text-muted">{dict.stickers.receipt.notFound}</p>
        </div>
      </Container>
    );
  }

  const steps = [
    { key: "build", label: dict.stickers.steps.build },
    { key: "details", label: dict.stickers.steps.details },
    { key: "confirm", label: dict.stickers.steps.confirm },
  ];

  return (
    <Container>
      <div className="flex flex-col gap-8 py-10">
        <StepIndicator steps={steps} current={2} />
        <OrderReceipt order={order} dict={dict.stickers} locale={lang} />
      </div>
    </Container>
  );
}
