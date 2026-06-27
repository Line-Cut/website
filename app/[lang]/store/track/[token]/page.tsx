import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "../../../dictionaries";
import { getOrderByToken } from "@/lib/orders/order-view";
import { StoreOrderReceipt } from "@/components/store/store-order-receipt";

export const dynamic = "force-dynamic";

export default async function StoreTrackPage({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}) {
  const { lang, token } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  const order = await getOrderByToken(token, lang);

  // This route renders store orders; a sticker order's token tracks at /stickers/track.
  if (!order || order.kind !== "store") {
    return (
      <Container>
        <div className="py-10">
          <p className="text-base text-muted">{dict.store.receipt.notFound}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mx-auto max-w-2xl py-10">
        <StoreOrderReceipt order={order} dict={dict.store} locale={lang} />
      </div>
    </Container>
  );
}
