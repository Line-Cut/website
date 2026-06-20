import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../../dictionaries";
import { getOrderByToken } from "@/lib/orders/order-view";
import { OrderReceipt } from "@/components/stickers/order-receipt";

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

  return (
    <Container>
      <div className="py-10">
        <OrderReceipt order={order} dict={dict.stickers} locale={lang} />
      </div>
    </Container>
  );
}
