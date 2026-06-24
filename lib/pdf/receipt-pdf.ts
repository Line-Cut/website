import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatMoney } from "@/lib/stickers/format";

// ---------------------------------------------------------------------------
// Receipt PDF — SEAM. Payment is mocked today, so this writes a clearly-labelled
// placeholder receipt into the paid bucket. When the real (non-standard) payment
// provider is wired, replace this with the provider's actual receipt (or build
// a real one from confirmed payment data). ASCII-only → standard Helvetica is
// enough; no embedded font needed.
// ---------------------------------------------------------------------------

export type ReceiptContext = {
  orderId: string;
  amount: number; // minor units (agorot)
  currency: string;
  reference: string | null;
  paidAtISO: string;
};

export async function buildPlaceholderReceiptPdf(
  input: ReceiptContext,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  const ink = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.36, 0.36, 0.36);
  let y = 785;

  const draw = (
    text: string,
    opts?: { size?: number; color?: ReturnType<typeof rgb> },
  ) => {
    const size = opts?.size ?? 11;
    page.drawText(text, { x: 56, y, size, font, color: opts?.color ?? ink });
    y -= size + 8;
  };

  draw("Line Cut — Payment receipt", { size: 18 });
  y -= 6;
  draw("(placeholder — payment is currently mocked)", { size: 10, color: muted });
  y -= 12;
  draw(`Order ID:  ${input.orderId}`);
  draw(`Reference: ${input.reference ?? "-"}`);
  draw(`Paid at:   ${input.paidAtISO}`);
  draw(`Amount:    ${formatMoney(input.amount, input.currency, "en")}`);
  y -= 12;
  draw(
    "This placeholder will be replaced by the payment provider's receipt.",
    { color: muted },
  );

  return doc.save();
}
